import { Redis } from 'ioredis';
import { CancellationConfirmation, AppointmentDetails, EnhancedCancellationRequest, EnhancedCancellationResponse } from '../types';
export declare class CancellationConfirmationService {
    private redis;
    private notificationService;
    constructor(redis: Redis, notificationService: any);
    createCancellationConfirmation(appointment: AppointmentDetails, request: EnhancedCancellationRequest, cancellationFee?: number): Promise<CancellationConfirmation>;
    deliverConfirmation(confirmation: CancellationConfirmation, request: EnhancedCancellationRequest): Promise<EnhancedCancellationResponse>;
    private deliverVoiceConfirmation;
    private deliverSMSConfirmation;
    private deliverEmailConfirmation;
    private generateVoiceConfirmationMessage;
    private generateSMSConfirmationMessage;
    private generateEmailConfirmationContent;
    private generateConfirmationMessage;
    private spellReferenceNumber;
    private formatAppointmentDateForSpeech;
    private formatAppointmentDate;
    private generateCancellationReferenceNumber;
    private storeCancellationConfirmation;
    getCancellationConfirmation(referenceNumber: string): Promise<CancellationConfirmation | null>;
    updateWaitlistNotificationStatus(referenceNumber: string, notified: boolean, notificationCount: number): Promise<void>;
}
//# sourceMappingURL=cancellation-confirmation-service.d.ts.map