import { Redis } from 'ioredis';
import { OpenEMRSchedulingClient } from './openemr-client';
import { AvailabilityService } from './availability-service';
import { AvailabilityResponseGenerator } from './availability-response-generator';
import { AppointmentModificationRequest, AppointmentModificationResponse, RescheduleRequest, RescheduleResponse, CancellationPolicy } from '../types';
export declare class AppointmentManagementService {
    private openemrClient;
    private availabilityService;
    private responseGenerator;
    private redis;
    private cancellationPolicy;
    constructor(openemrClient: OpenEMRSchedulingClient, availabilityService: AvailabilityService, responseGenerator: AvailabilityResponseGenerator, redis: Redis, cancellationPolicy: CancellationPolicy);
    modifyAppointment(request: AppointmentModificationRequest): Promise<AppointmentModificationResponse>;
    rescheduleAppointment(request: RescheduleRequest): Promise<RescheduleResponse>;
    confirmReschedule(appointmentId: string, patientId: string, newSlotId: string, conversationId: string): Promise<AppointmentModificationResponse>;
    private handleCancellationRequest;
    private handleTypeChangeRequest;
    private handleRescheduleRequest;
    private getAppointmentDetails;
    private storeAppointmentDetails;
    private storeChangeHistory;
    private isAppointmentInPast;
    private getHoursUntilAppointment;
    private calculateCancellationFee;
    private checkRescheduleConflicts;
    private generateRescheduleOptions;
    private generateRescheduleConfirmation;
    private formatAppointmentDate;
    private generateConfirmationNumber;
    private generateChangeId;
    private getDefaultRescheduleRange;
    private getSlotDetails;
    private invalidateAvailabilityCache;
    private checkProviderCapabilities;
    private getAppointmentDuration;
    private checkDurationFits;
}
//# sourceMappingURL=appointment-management-service.d.ts.map