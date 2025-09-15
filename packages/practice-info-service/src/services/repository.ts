import { Pool, PoolClient } from 'pg';
import { createLogger } from '@ai-voice-agent/shared-utils';
import {
  PracticeConfiguration,
  PracticeLocation,
  BusinessHours,
  HolidaySchedule,
  InsurancePlan,
  AppointmentType,
  PracticePolicy,
  PracticeFAQ,
} from '../types';

const logger = createLogger('practice-info-repository');

export class PracticeInfoRepository {
  private pool: Pool;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://voice_agent:voice_agent_password@localhost:5432/voice_agent_dev';
    
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10, // Maximum number of clients in pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
    });

    this.pool.on('error', (err) => {
      logger.error('PostgreSQL pool error', { error: err.message });
    });
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Practice Configuration
  async getPracticeConfiguration(): Promise<PracticeConfiguration | null> {
    const client = await this.getClient();
    try {
      const result = await client.query(
        'SELECT * FROM practice_configuration WHERE is_active = true LIMIT 1'
      );
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        practiceName: row.practice_name,
        practiceTimezone: row.practice_timezone,
        phoneNumber: row.phone_number,
        websiteUrl: row.website_url,
        email: row.email,
        description: row.description,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error('Failed to get practice configuration', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  // Practice Locations
  async getPrimaryLocation(): Promise<PracticeLocation | null> {
    const client = await this.getClient();
    try {
      const result = await client.query(`
        SELECT pl.*, pc.practice_name 
        FROM practice_locations pl
        JOIN practice_configuration pc ON pl.practice_id = pc.id
        WHERE pl.is_primary = true AND pl.is_active = true AND pc.is_active = true
        LIMIT 1
      `);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapLocationRow(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get primary location', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  async getAllLocations(): Promise<PracticeLocation[]> {
    const client = await this.getClient();
    try {
      const result = await client.query(`
        SELECT pl.*, pc.practice_name 
        FROM practice_locations pl
        JOIN practice_configuration pc ON pl.practice_id = pc.id
        WHERE pl.is_active = true AND pc.is_active = true
        ORDER BY pl.is_primary DESC, pl.location_name
      `);
      
      return result.rows.map(this.mapLocationRow);
    } catch (error) {
      logger.error('Failed to get all locations', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  private mapLocationRow(row: any): PracticeLocation {
    return {
      id: row.id,
      practiceId: row.practice_id,
      locationName: row.location_name,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      city: row.city,
      state: row.state,
      zipCode: row.zip_code,
      country: row.country,
      phoneNumber: row.phone_number,
      faxNumber: row.fax_number,
      parkingInstructions: row.parking_instructions,
      parkingCost: row.parking_cost,
      accessibilityFeatures: row.accessibility_features || [],
      publicTransportation: row.public_transportation,
      directions: row.directions,
      isPrimary: row.is_primary,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // Business Hours
  async getBusinessHours(date?: Date, locationId?: string): Promise<BusinessHours[]> {
    const client = await this.getClient();
    try {
      let query = `
        SELECT bh.*, pc.practice_name, pl.location_name
        FROM business_hours bh
        JOIN practice_configuration pc ON bh.practice_id = pc.id
        LEFT JOIN practice_locations pl ON bh.location_id = pl.id
        WHERE bh.is_active = true AND pc.is_active = true
      `;
      
      const params: any[] = [];

      if (locationId) {
        query += ' AND bh.location_id = $' + (params.length + 1);
        params.push(locationId);
      }

      if (date) {
        // Check for seasonal schedules first, then regular schedules
        query += ` AND (
          (bh.schedule_type = 'seasonal' AND $${params.length + 1} BETWEEN bh.effective_start_date AND bh.effective_end_date)
          OR (bh.schedule_type = 'regular' AND (bh.effective_start_date IS NULL OR bh.effective_start_date <= $${params.length + 1})
              AND (bh.effective_end_date IS NULL OR bh.effective_end_date >= $${params.length + 1}))
        )`;
        params.push(date);
      } else {
        query += " AND bh.schedule_type = 'regular'";
      }

      query += ' ORDER BY bh.day_of_week, bh.schedule_type';

      const result = await client.query(query, params);
      
      return result.rows.map(this.mapBusinessHoursRow);
    } catch (error) {
      logger.error('Failed to get business hours', { error, date, locationId });
      throw error;
    } finally {
      client.release();
    }
  }

  async getCurrentDayHours(date: Date, locationId?: string): Promise<BusinessHours | null> {
    const dayOfWeek = date.getDay();
    const hours = await this.getBusinessHours(date, locationId);
    
    const todayHours = hours.find(h => h.dayOfWeek === dayOfWeek);
    return todayHours || null;
  }

  private mapBusinessHoursRow(row: any): BusinessHours {
    return {
      id: row.id,
      practiceId: row.practice_id,
      locationId: row.location_id,
      dayOfWeek: row.day_of_week,
      openTime: row.open_time,
      closeTime: row.close_time,
      breakStart: row.break_start,
      breakEnd: row.break_end,
      scheduleType: row.schedule_type,
      effectiveStartDate: row.effective_start_date,
      effectiveEndDate: row.effective_end_date,
      notes: row.notes,
      isClosed: row.is_closed,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // Holiday Schedules
  async getUpcomingHolidays(days: number = 30, locationId?: string): Promise<HolidaySchedule[]> {
    const client = await this.getClient();
    try {
      let query = `
        SELECT hs.*, pc.practice_name, pl.location_name
        FROM holiday_schedules hs
        JOIN practice_configuration pc ON hs.practice_id = pc.id
        LEFT JOIN practice_locations pl ON hs.location_id = pl.id
        WHERE hs.is_active = true AND pc.is_active = true
        AND hs.holiday_date >= CURRENT_DATE
        AND hs.holiday_date <= CURRENT_DATE + INTERVAL '$1 days'
      `;
      
      const params: any[] = [days];

      if (locationId) {
        query += ' AND hs.location_id = $' + (params.length + 1);
        params.push(locationId);
      }

      query += ' ORDER BY hs.holiday_date';

      const result = await client.query(query, params);
      
      return result.rows.map(this.mapHolidayScheduleRow);
    } catch (error) {
      logger.error('Failed to get upcoming holidays', { error, days, locationId });
      throw error;
    } finally {
      client.release();
    }
  }

  async getHolidaySchedule(date: Date, locationId?: string): Promise<HolidaySchedule | null> {
    const client = await this.getClient();
    try {
      let query = `
        SELECT hs.*, pc.practice_name, pl.location_name
        FROM holiday_schedules hs
        JOIN practice_configuration pc ON hs.practice_id = pc.id
        LEFT JOIN practice_locations pl ON hs.location_id = pl.id
        WHERE hs.is_active = true AND pc.is_active = true
        AND hs.holiday_date = $1
      `;
      
      const params: any[] = [date];

      if (locationId) {
        query += ' AND hs.location_id = $' + (params.length + 1);
        params.push(locationId);
      }

      const result = await client.query(query, params);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapHolidayScheduleRow(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get holiday schedule', { error, date, locationId });
      throw error;
    } finally {
      client.release();
    }
  }

  private mapHolidayScheduleRow(row: any): HolidaySchedule {
    return {
      id: row.id,
      practiceId: row.practice_id,
      locationId: row.location_id,
      holidayName: row.holiday_name,
      holidayDate: row.holiday_date,
      openTime: row.open_time,
      closeTime: row.close_time,
      isRecurring: row.is_recurring,
      recurringType: row.recurring_type,
      advanceNoticeDays: row.advance_notice_days,
      noticeMessage: row.notice_message,
      isClosed: row.is_closed,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // Insurance Plans
  async getAcceptedInsurancePlans(): Promise<InsurancePlan[]> {
    const client = await this.getClient();
    try {
      const result = await client.query(`
        SELECT ip.*, pc.practice_name
        FROM insurance_plans ip
        JOIN practice_configuration pc ON ip.practice_id = pc.id
        WHERE ip.is_accepted = true AND ip.is_active = true AND pc.is_active = true
        AND (ip.effective_end_date IS NULL OR ip.effective_end_date >= CURRENT_DATE)
        ORDER BY ip.insurance_company, ip.plan_name
      `);
      
      return result.rows.map(this.mapInsurancePlanRow);
    } catch (error) {
      logger.error('Failed to get accepted insurance plans', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  async checkInsuranceAcceptance(insuranceCompany: string, planName?: string): Promise<InsurancePlan | null> {
    const client = await this.getClient();
    try {
      let query = `
        SELECT ip.*, pc.practice_name
        FROM insurance_plans ip
        JOIN practice_configuration pc ON ip.practice_id = pc.id
        WHERE ip.is_active = true AND pc.is_active = true
        AND LOWER(ip.insurance_company) = LOWER($1)
      `;
      
      const params: any[] = [insuranceCompany];

      if (planName) {
        query += ' AND LOWER(ip.plan_name) = LOWER($2)';
        params.push(planName);
      }

      query += ' AND (ip.effective_end_date IS NULL OR ip.effective_end_date >= CURRENT_DATE)';
      query += ' ORDER BY ip.is_accepted DESC, ip.plan_name';

      const result = await client.query(query, params);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapInsurancePlanRow(result.rows[0]);
    } catch (error) {
      logger.error('Failed to check insurance acceptance', { error, insuranceCompany, planName });
      throw error;
    } finally {
      client.release();
    }
  }

  private mapInsurancePlanRow(row: any): InsurancePlan {
    return {
      id: row.id,
      practiceId: row.practice_id,
      insuranceCompany: row.insurance_company,
      planName: row.plan_name,
      planType: row.plan_type,
      isAccepted: row.is_accepted,
      requiresReferral: row.requires_referral,
      requiresPreauthorization: row.requires_preauthorization,
      copayAmount: row.copay_amount,
      verificationRequirements: row.verification_requirements || [],
      notes: row.notes,
      effectiveStartDate: row.effective_start_date,
      effectiveEndDate: row.effective_end_date,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // Appointment Types
  async getAppointmentTypes(): Promise<AppointmentType[]> {
    const client = await this.getClient();
    try {
      const result = await client.query(`
        SELECT at.*, pc.practice_name
        FROM appointment_types at
        JOIN practice_configuration pc ON at.practice_id = pc.id
        WHERE at.is_active = true AND pc.is_active = true
        ORDER BY at.appointment_type_name
      `);
      
      return result.rows.map(this.mapAppointmentTypeRow);
    } catch (error) {
      logger.error('Failed to get appointment types', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  async getAppointmentType(appointmentTypeName: string): Promise<AppointmentType | null> {
    const client = await this.getClient();
    try {
      const result = await client.query(`
        SELECT at.*, pc.practice_name
        FROM appointment_types at
        JOIN practice_configuration pc ON at.practice_id = pc.id
        WHERE at.is_active = true AND pc.is_active = true
        AND LOWER(at.appointment_type_name) = LOWER($1)
        LIMIT 1
      `, [appointmentTypeName]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapAppointmentTypeRow(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get appointment type', { error, appointmentTypeName });
      throw error;
    } finally {
      client.release();
    }
  }

  private mapAppointmentTypeRow(row: any): AppointmentType {
    return {
      id: row.id,
      practiceId: row.practice_id,
      appointmentTypeName: row.appointment_type_name,
      durationMinutes: row.duration_minutes,
      description: row.description,
      requiresDilation: row.requires_dilation,
      requiresDriver: row.requires_driver,
      fastingRequired: row.fasting_required,
      bringRequirements: row.bring_requirements || [],
      preparationInstructions: row.preparation_instructions,
      postAppointmentCare: row.post_appointment_care,
      bufferTimeMinutes: row.buffer_time_minutes,
      maxDailyAppointments: row.max_daily_appointments,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // Practice Policies
  async getPracticePolicies(category?: string): Promise<PracticePolicy[]> {
    const client = await this.getClient();
    try {
      let query = `
        SELECT pp.*, pc.practice_name
        FROM practice_policies pp
        JOIN practice_configuration pc ON pp.practice_id = pc.id
        WHERE pp.is_active = true AND pc.is_active = true
        AND (pp.effective_end_date IS NULL OR pp.effective_end_date >= CURRENT_DATE)
      `;
      
      const params: any[] = [];

      if (category) {
        query += ' AND LOWER(pp.policy_category) = LOWER($1)';
        params.push(category);
      }

      query += ' ORDER BY pp.severity_level DESC, pp.policy_category, pp.policy_name';

      const result = await client.query(query, params);
      
      return result.rows.map(this.mapPracticePolicyRow);
    } catch (error) {
      logger.error('Failed to get practice policies', { error, category });
      throw error;
    } finally {
      client.release();
    }
  }

  async getVoiceResponsePolicies(): Promise<PracticePolicy[]> {
    const client = await this.getClient();
    try {
      const result = await client.query(`
        SELECT pp.*, pc.practice_name
        FROM practice_policies pp
        JOIN practice_configuration pc ON pp.practice_id = pc.id
        WHERE pp.is_active = true AND pc.is_active = true
        AND pp.include_in_voice_response = true
        AND (pp.effective_end_date IS NULL OR pp.effective_end_date >= CURRENT_DATE)
        ORDER BY pp.severity_level DESC, pp.policy_category, pp.policy_name
      `);
      
      return result.rows.map(this.mapPracticePolicyRow);
    } catch (error) {
      logger.error('Failed to get voice response policies', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  private mapPracticePolicyRow(row: any): PracticePolicy {
    return {
      id: row.id,
      practiceId: row.practice_id,
      policyCategory: row.policy_category,
      policyName: row.policy_name,
      policyContent: row.policy_content,
      severityLevel: row.severity_level,
      appliesToAppointmentTypes: row.applies_to_appointment_types || [],
      includeInVoiceResponse: row.include_in_voice_response,
      voiceSummary: row.voice_summary,
      effectiveStartDate: row.effective_start_date,
      effectiveEndDate: row.effective_end_date,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // FAQs
  async getFAQsByCategory(category: string): Promise<PracticeFAQ[]> {
    const client = await this.getClient();
    try {
      const result = await client.query(`
        SELECT pf.*, pc.practice_name
        FROM practice_faqs pf
        JOIN practice_configuration pc ON pf.practice_id = pc.id
        WHERE pf.is_active = true AND pc.is_active = true
        AND LOWER(pf.question_category) = LOWER($1)
        ORDER BY pf.usage_count DESC, pf.question_text
      `, [category]);
      
      return result.rows.map(this.mapPracticeFAQRow);
    } catch (error) {
      logger.error('Failed to get FAQs by category', { error, category });
      throw error;
    } finally {
      client.release();
    }
  }

  async searchFAQs(searchTerm: string, category?: string): Promise<PracticeFAQ[]> {
    const client = await this.getClient();
    try {
      let query = `
        SELECT pf.*, pc.practice_name
        FROM practice_faqs pf
        JOIN practice_configuration pc ON pf.practice_id = pc.id
        WHERE pf.is_active = true AND pc.is_active = true
        AND (
          pf.keywords @> $1::jsonb
          OR LOWER(pf.question_text) LIKE LOWER($2)
          OR LOWER(pf.answer_text) LIKE LOWER($2)
        )
      `;
      
      const params: any[] = [JSON.stringify([searchTerm]), `%${searchTerm}%`];

      if (category) {
        query += ' AND LOWER(pf.question_category) = LOWER($3)';
        params.push(category);
      }

      query += ' ORDER BY pf.usage_count DESC, pf.question_text';

      const result = await client.query(query, params);
      
      return result.rows.map(this.mapPracticeFAQRow);
    } catch (error) {
      logger.error('Failed to search FAQs', { error, searchTerm, category });
      throw error;
    } finally {
      client.release();
    }
  }

  async incrementFAQUsage(faqId: string): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query(`
        UPDATE practice_faqs 
        SET usage_count = usage_count + 1, last_used_at = NOW()
        WHERE id = $1
      `, [faqId]);
    } catch (error) {
      logger.error('Failed to increment FAQ usage', { error, faqId });
      // Don't throw error as this is non-critical
    } finally {
      client.release();
    }
  }

  private mapPracticeFAQRow(row: any): PracticeFAQ {
    return {
      id: row.id,
      practiceId: row.practice_id,
      questionCategory: row.question_category,
      questionText: row.question_text,
      answerText: row.answer_text,
      voiceResponseText: row.voice_response_text,
      confirmationPrompt: row.confirmation_prompt,
      usageCount: row.usage_count,
      lastUsedAt: row.last_used_at,
      keywords: row.keywords || [],
      intentCategories: row.intent_categories || [],
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// Singleton instance
export const practiceInfoRepository = new PracticeInfoRepository();