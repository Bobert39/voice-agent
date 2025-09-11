/**
 * Mock OpenEMR API for Development and Testing
 * 
 * Simulates OpenEMR REST API responses for development when
 * actual OpenEMR instance is not available
 */

import crypto from 'crypto';

interface MockPatient {
  pid: string;
  fname: string;
  lname: string;
  DOB: string;
  phone_home?: string;
  phone_cell?: string;
  email?: string;
}

interface MockAppointment {
  id: string;
  patient_id: string;
  provider_id: string;
  start_date: string;
  end_date: string;
  status: string;
  appointment_type: string;
  duration: number;
  reason?: string;
}

interface MockProvider {
  id: string;
  name: string;
  specialty: string;
  available_days: string[];
  start_hour: number;
  end_hour: number;
}

export class MockOpenEMRAPI {
  private patients: MockPatient[] = [];
  private appointments: MockAppointment[] = [];
  private providers: MockProvider[] = [];
  private accessTokens: Set<string> = new Set();

  constructor() {
    this.initializeMockData();
  }

  /**
   * Initialize with sample data representing Capitol Eye Care
   */
  private initializeMockData(): void {
    // Sample patients - diverse age range 18+
    this.patients = [
      {
        pid: '1',
        fname: 'Margaret',
        lname: 'Smith',
        DOB: '1942-03-15',
        phone_home: '555-0101',
        phone_cell: '555-0102',
        email: 'margaret.smith@email.com'
      },
      {
        pid: '2',
        fname: 'Michael',
        lname: 'Chen',
        DOB: '1990-07-22',
        phone_home: '555-0201',
        phone_cell: '555-0202',
        email: 'michael.chen@email.com'
      },
      {
        pid: '3',
        fname: 'Sarah',
        lname: 'Williams',
        DOB: '1985-11-08',
        phone_home: '555-0301',
        email: 'sarah.williams@email.com'
      },
      {
        pid: '4',
        fname: 'David',
        lname: 'Brown',
        DOB: '2000-12-03',
        phone_home: '555-0401',
        phone_cell: '555-0402'
      }
    ];

    // Sample providers at Capitol Eye Care
    this.providers = [
      {
        id: '1',
        name: 'Dr. Sarah Mitchell',
        specialty: 'Comprehensive Eye Care',
        available_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        start_hour: 8,
        end_hour: 17
      },
      {
        id: '2', 
        name: 'Dr. Michael Chen',
        specialty: 'Retinal Specialist',
        available_days: ['Tuesday', 'Thursday', 'Friday'],
        start_hour: 9,
        end_hour: 16
      },
      {
        id: '3',
        name: 'Dr. Jennifer Davis',
        specialty: 'Pediatric Ophthalmology',
        available_days: ['Monday', 'Wednesday', 'Friday'],
        start_hour: 8,
        end_hour: 15
      }
    ];

    // Sample appointments
    const today = new Date();
    this.appointments = [
      {
        id: '1',
        patient_id: '1',
        provider_id: '1',
        start_date: new Date(today.getTime() + 86400000).toISOString(), // Tomorrow 10:00 AM
        end_date: new Date(today.getTime() + 86400000 + 1800000).toISOString(), // 30 min later
        status: 'scheduled',
        appointment_type: 'routine_exam',
        duration: 30,
        reason: 'Annual eye examination'
      },
      {
        id: '2',
        patient_id: '2',
        provider_id: '1',
        start_date: new Date(today.getTime() + 86400000 + 7200000).toISOString(), // Tomorrow 12:00 PM
        end_date: new Date(today.getTime() + 86400000 + 9000000).toISOString(), // 30 min later
        status: 'scheduled',
        appointment_type: 'follow_up',
        duration: 30,
        reason: 'Follow-up after cataract surgery'
      }
    ];
  }

  /**
   * Mock OAuth2 token generation
   */
  generateMockToken(): { access_token: string; refresh_token: string; expires_in: number; token_type: string } {
    const accessToken = `mock_token_${crypto.randomBytes(16).toString('hex')}`;
    const refreshToken = `mock_refresh_${crypto.randomBytes(16).toString('hex')}`;
    
    this.accessTokens.add(accessToken);
    
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      token_type: 'Bearer'
    };
  }

  /**
   * Validate mock token
   */
  validateToken(token: string): boolean {
    return this.accessTokens.has(token);
  }

  /**
   * Mock patient search and verification
   */
  searchPatients(query?: {
    fname?: string;
    lname?: string;
    dob?: string;
    phone?: string;
  }): MockPatient[] {
    if (!query) {
      return this.patients;
    }

    return this.patients.filter(patient => {
      if (query.fname && patient.fname.toLowerCase() !== query.fname.toLowerCase()) {
        return false;
      }
      if (query.lname && patient.lname.toLowerCase() !== query.lname.toLowerCase()) {
        return false;
      }
      if (query.dob && patient.DOB !== query.dob) {
        return false;
      }
      if (query.phone && patient.phone_home !== query.phone && patient.phone_cell !== query.phone) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get patient by ID
   */
  getPatient(patientId: string): MockPatient | null {
    return this.patients.find(p => p.pid === patientId) || null;
  }

  /**
   * Get patient appointments
   */
  getPatientAppointments(patientId: string, startDate?: string, endDate?: string): MockAppointment[] {
    let appointments = this.appointments.filter(apt => apt.patient_id === patientId);
    
    if (startDate) {
      appointments = appointments.filter(apt => apt.start_date >= startDate);
    }
    
    if (endDate) {
      appointments = appointments.filter(apt => apt.start_date <= endDate);
    }
    
    return appointments;
  }

  /**
   * Get all appointments for a provider on a date
   */
  getProviderAppointments(providerId: string, date: string): MockAppointment[] {
    return this.appointments.filter(apt => 
      apt.provider_id === providerId && 
      apt.start_date.startsWith(date)
    );
  }

  /**
   * Generate available time slots for a provider on a specific date
   */
  getAvailableSlots(providerId: string, date: string, duration: number = 30): string[] {
    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) {
      return [];
    }

    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
    if (!provider.available_days.includes(dayOfWeek)) {
      return [];
    }

    const existingAppointments = this.getProviderAppointments(providerId, date);
    const slots: string[] = [];

    // Generate time slots from start to end hour
    for (let hour = provider.start_hour; hour < provider.end_hour; hour++) {
      for (let minute = 0; minute < 60; minute += duration) {
        const timeSlot = `${date} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        
        // Check if slot conflicts with existing appointments
        const hasConflict = existingAppointments.some(apt => {
          const aptStart = new Date(apt.start_date);
          const aptEnd = new Date(apt.end_date);
          const slotStart = new Date(timeSlot);
          const slotEnd = new Date(slotStart.getTime() + duration * 60000);
          
          return (slotStart < aptEnd && slotEnd > aptStart);
        });
        
        if (!hasConflict) {
          slots.push(timeSlot);
        }
      }
    }
    
    return slots;
  }

  /**
   * Check for appointment conflicts
   */
  checkConflict(providerId: string, startDate: string, duration: number, excludeId?: string): {
    hasConflict: boolean;
    conflictingAppointments: MockAppointment[];
    reason?: string;
  } {
    const endDate = new Date(new Date(startDate).getTime() + duration * 60000).toISOString();
    
    const conflicts = this.appointments.filter(apt => {
      if (excludeId && apt.id === excludeId) {
        return false;
      }
      
      if (apt.provider_id !== providerId) {
        return false;
      }
      
      const aptStart = new Date(apt.start_date);
      const aptEnd = new Date(apt.end_date);
      const newStart = new Date(startDate);
      const newEnd = new Date(endDate);
      
      return (newStart < aptEnd && newEnd > aptStart);
    });

    return {
      hasConflict: conflicts.length > 0,
      conflictingAppointments: conflicts,
      reason: conflicts.length > 0 ? 'Time slot conflicts with existing appointment' : undefined
    };
  }

  /**
   * Create new appointment
   */
  createAppointment(appointmentData: {
    patient_id: string;
    provider_id: string;
    start_date: string;
    duration: number;
    appointment_type: string;
    reason?: string;
  }): MockAppointment {
    // Check for conflicts
    const conflict = this.checkConflict(
      appointmentData.provider_id,
      appointmentData.start_date,
      appointmentData.duration
    );

    if (conflict.hasConflict) {
      throw new Error('Appointment conflicts with existing booking');
    }

    const endDate = new Date(
      new Date(appointmentData.start_date).getTime() + appointmentData.duration * 60000
    ).toISOString();

    const newAppointment: MockAppointment = {
      id: (this.appointments.length + 1).toString(),
      ...appointmentData,
      end_date: endDate,
      status: 'scheduled'
    };

    this.appointments.push(newAppointment);
    return newAppointment;
  }

  /**
   * Update appointment
   */
  updateAppointment(appointmentId: string, updates: Partial<MockAppointment>): MockAppointment {
    const index = this.appointments.findIndex(apt => apt.id === appointmentId);
    if (index === -1) {
      throw new Error('Appointment not found');
    }

    if (updates.start_date && updates.duration) {
      const conflict = this.checkConflict(
        updates.provider_id || this.appointments[index].provider_id,
        updates.start_date,
        updates.duration,
        appointmentId
      );

      if (conflict.hasConflict) {
        throw new Error('Updated time conflicts with existing appointment');
      }

      updates.end_date = new Date(
        new Date(updates.start_date).getTime() + updates.duration * 60000
      ).toISOString();
    }

    this.appointments[index] = { ...this.appointments[index], ...updates };
    return this.appointments[index];
  }

  /**
   * Cancel appointment
   */
  cancelAppointment(appointmentId: string, reason?: string): void {
    this.updateAppointment(appointmentId, {
      status: 'cancelled',
      reason: reason || 'Cancelled by patient'
    });
  }

  /**
   * Get providers
   */
  getProviders(): MockProvider[] {
    return this.providers;
  }

  /**
   * Simulate typical patient scenarios for Capitol Eye Care
   */
  getPatientScenarios(): {
    scenario: string;
    patient: MockPatient;
    suggestedQuestions: string[];
  }[] {
    return [
      {
        scenario: 'Routine Annual Exam',
        patient: this.patients[0], // Margaret Smith (elderly patient)
        suggestedQuestions: [
          "What time is my appointment tomorrow?",
          "Do I need to bring my insurance card?",
          "Should I stop taking my eye drops before the exam?",
          "Will you dilate my pupils?"
        ]
      },
      {
        scenario: 'Contact Lens Follow-up',
        patient: this.patients[1], // Michael Chen (young professional)
        suggestedQuestions: [
          "When is my contact lens check-up?",
          "Can I wear my contacts to the appointment?",
          "How long will the appointment take?",
          "Do you have my contact lens prescription?"
        ]
      },
      {
        scenario: 'Eye Strain Consultation',
        patient: this.patients[2], // Sarah Williams (working age adult)
        suggestedQuestions: [
          "I've been having eye strain from computer work",
          "What are your availability times this week?",
          "Do you offer blue light glasses?",
          "How much will the consultation cost?"
        ]
      },
      {
        scenario: 'New Patient Inquiry',
        patient: {
          pid: '999',
          fname: 'Sarah',
          lname: 'Johnson',
          DOB: '1985-08-22',
          phone_home: '555-0999'
        },
        suggestedQuestions: [
          "What are your office hours?",
          "Do you accept Medicare?",
          "How do I schedule an appointment?",
          "What should I bring to my first visit?"
        ]
      }
    ];
  }

  /**
   * Reset mock data to initial state
   */
  reset(): void {
    this.appointments = [];
    this.accessTokens.clear();
    this.initializeMockData();
  }

  /**
   * Get statistics for testing dashboard
   */
  getStatistics(): {
    totalPatients: number;
    totalAppointments: number;
    appointmentsByStatus: Record<string, number>;
    appointmentsByType: Record<string, number>;
    averageAppointmentDuration: number;
  } {
    const appointmentsByStatus: Record<string, number> = {};
    const appointmentsByType: Record<string, number> = {};
    let totalDuration = 0;

    this.appointments.forEach(apt => {
      appointmentsByStatus[apt.status] = (appointmentsByStatus[apt.status] || 0) + 1;
      appointmentsByType[apt.appointment_type] = (appointmentsByType[apt.appointment_type] || 0) + 1;
      totalDuration += apt.duration;
    });

    return {
      totalPatients: this.patients.length,
      totalAppointments: this.appointments.length,
      appointmentsByStatus,
      appointmentsByType,
      averageAppointmentDuration: this.appointments.length > 0 ? totalDuration / this.appointments.length : 0
    };
  }
}