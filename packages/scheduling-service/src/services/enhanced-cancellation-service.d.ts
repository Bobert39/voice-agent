import { Redis } from 'ioredis';
import { AppointmentManagementService } from './appointment-management-service';
import { WaitlistManagementService } from './waitlist-management-service';
import { CancellationConfirmationService } from './cancellation-confirmation-service';
import { StaffNotificationService } from './staff-notification-service';
import { EnhancedCancellationRequest, EnhancedCancellationResponse } from '../types';
export declare class EnhancedCancellationService {
    private appointmentService;
    private waitlistService;
    private confirmationService;
    private staffNotificationService;
    private redis;
    constructor(appointmentService: AppointmentManagementService, waitlistService: WaitlistManagementService, confirmationService: CancellationConfirmationService, staffNotificationService: StaffNotificationService, redis: Redis);
    processCancellation(request: EnhancedCancellationRequest): Promise<EnhancedCancellationResponse>;
    private processEmergencyCancellation;
    private notifyWaitlist;
    private notifyWaitlistUrgent;
    private getAndValidateAppointment;
    private isLateNotice;
    private generateEmergencyConfirmationMessage;
    getCancellationByReference(referenceNumber: string): Promise<any>;
    processWaitlistResponse(notificationId: string, response: 'accepted' | 'declined'): Promise<boolean>;
    getActiveStaffNotifications(department?: string): Promise<any[]>;
    getCancellationMetrics(timeframe?: 'hour' | 'day' | 'week'): Promise<{
        totalCancellations: number;
        emergencyCancellations: number;
        lateCancellations: number;
        totalWaitlistNotifications: number;
        averageWaitlistResponseRate: number;
        totalCancellationFees: number;
        averageStaffResponseTime: number;
    }>;
}
//# sourceMappingURL=enhanced-cancellation-service.d.ts.map