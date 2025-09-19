import { Redis } from 'ioredis';
import { StaffNotification, AppointmentDetails, CancellationConfirmation, WaitlistEntry } from '../types';
export declare class StaffNotificationService {
    private redis;
    private webSocketService;
    constructor(redis: Redis, webSocketService: any);
    notifyStaffOfCancellation(appointment: AppointmentDetails, confirmation: CancellationConfirmation, isEmergency?: boolean, isLateNotice?: boolean): Promise<StaffNotification>;
    notifyStaffOfWaitlistResponse(waitlistEntry: WaitlistEntry, response: 'accepted' | 'declined' | 'no_response', availableSlot: any): Promise<StaffNotification>;
    acknowledgeNotification(notificationId: string, staffMemberId: string, staffMemberName: string): Promise<boolean>;
    resolveNotification(notificationId: string, staffMemberId: string, staffMemberName: string, notes?: string): Promise<boolean>;
    getActiveNotifications(department?: string, priority?: string, limit?: number): Promise<StaffNotification[]>;
    getNotificationMetrics(timeframe?: 'hour' | 'day' | 'week'): Promise<{
        totalNotifications: number;
        byType: Record<string, number>;
        byPriority: Record<string, number>;
        byDepartment: Record<string, number>;
        averageAcknowledgmentTime: number;
        averageResolutionTime: number;
        unacknowledgedCount: number;
        unresolvedCount: number;
    }>;
    private createCancellationNotification;
    private determineCancellationPriority;
    private determineWaitlistResponsePriority;
    private generateCancellationTitle;
    private generateWaitlistResponseTitle;
    private generateCancellationMessage;
    private generateWaitlistResponseMessage;
    private requiresStaffAction;
    private determineActionType;
    private determineDepartment;
    private generateNotificationId;
    private storeStaffNotification;
    private getStaffNotification;
    private sendRealTimeNotification;
    private addToDepartmentQueue;
    private removeFromUrgentQueue;
    private removeFromAllQueues;
    private sendAcknowledgmentUpdate;
    private sendResolutionUpdate;
}
//# sourceMappingURL=staff-notification-service.d.ts.map