import { Redis } from 'ioredis';
import { OpenEMRSchedulingClient } from './openemr-client';
interface AvailabilityQuery {
    startDate: string;
    endDate: string;
    appointmentType?: 'routine' | 'follow-up' | 'urgent';
    practitionerId?: string;
    preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
}
interface TimeSlot {
    datetime: string;
    practitioner: string;
    practitionerId: string;
    duration: number;
    appointmentType: string;
    available: boolean;
}
interface BusinessRules {
    businessHours: {
        monday: {
            open: string;
            close: string;
            lunchStart?: string;
            lunchEnd?: string;
        };
        tuesday: {
            open: string;
            close: string;
            lunchStart?: string;
            lunchEnd?: string;
        };
        wednesday: {
            open: string;
            close: string;
            lunchStart?: string;
            lunchEnd?: string;
        };
        thursday: {
            open: string;
            close: string;
            lunchStart?: string;
            lunchEnd?: string;
        };
        friday: {
            open: string;
            close: string;
            lunchStart?: string;
            lunchEnd?: string;
        };
        saturday?: {
            open: string;
            close: string;
        };
        sunday?: {
            open: string;
            close: string;
        };
    };
    appointmentDurations: {
        routine: number;
        'follow-up': number;
        urgent: number;
    };
    bufferTimes: {
        standard: number;
        complex: number;
    };
    holidays: string[];
    blockedTimes: Array<{
        dayOfWeek: string;
        startTime: string;
        endTime: string;
        reason: string;
    }>;
}
export declare class AvailabilityService {
    private openemrClient;
    private redis;
    private businessRules;
    private cacheEnabled;
    private cacheTTL;
    constructor(openemrClient: OpenEMRSchedulingClient, redis: Redis, businessRules: BusinessRules, cacheEnabled?: boolean);
    getAvailableSlots(query: AvailabilityQuery): Promise<TimeSlot[]>;
    private applyBusinessRules;
    private isHoliday;
    private isBlockedTime;
    private matchesTimePreference;
    private addMinutesToTime;
    private extractPractitionerIdFromSchedule;
    private getPractitioners;
    private generateCacheKey;
    invalidateCache(startDate?: string, endDate?: string): Promise<void>;
    getNextAvailableSlots(appointmentType?: 'routine' | 'follow-up' | 'urgent', maxSlots?: number, practitionerId?: string): Promise<TimeSlot[]>;
    parseNaturalDate(reference: string): {
        startDate: string;
        endDate: string;
    } | null;
}
export {};
//# sourceMappingURL=availability-service.d.ts.map