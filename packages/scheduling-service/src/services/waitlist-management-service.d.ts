import { Redis } from 'ioredis';
import { WaitlistEntry, WaitlistNotification, WaitlistMatchingCriteria } from '../types';
export declare class WaitlistManagementService {
    private redis;
    private notificationService;
    constructor(redis: Redis, notificationService: any);
    addToWaitlist(entry: Omit<WaitlistEntry, 'id' | 'createdAt'>): Promise<WaitlistEntry>;
    notifyWaitlistForCancelledSlot(criteria: WaitlistMatchingCriteria): Promise<WaitlistNotification[]>;
    private findWaitlistMatches;
    private calculateMatchScore;
    private sendWaitlistNotification;
    processWaitlistResponse(notificationId: string, response: 'accepted' | 'declined'): Promise<boolean>;
    cleanupExpiredEntries(): Promise<number>;
    private generateWaitlistId;
    private generateNotificationId;
    private calculatePriorityScore;
    private getTimeOfDay;
    private getMatchReasons;
    private estimateResponseTime;
    private calculateResponseDeadline;
    private isBusinessHours;
    private sendNotification;
    private generateNotificationMessage;
    private getWaitlistEntry;
    private getWaitlistNotification;
    private storeWaitlistNotification;
    private removeFromWaitlist;
    private recordDeclinedSlot;
}
//# sourceMappingURL=waitlist-management-service.d.ts.map