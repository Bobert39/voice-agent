"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WaitlistManagementService = void 0;
const shared_utils_1 = require("@voice-agent/shared-utils");
class WaitlistManagementService {
    redis;
    notificationService;
    constructor(redis, notificationService) {
        this.redis = redis;
        this.notificationService = notificationService;
    }
    async addToWaitlist(entry) {
        try {
            const waitlistEntry = {
                ...entry,
                id: this.generateWaitlistId(),
                createdAt: new Date().toISOString()
            };
            const ttl = entry.maxWaitDays * 24 * 60 * 60;
            const key = `waitlist:${waitlistEntry.id}`;
            await this.redis.setex(key, ttl, JSON.stringify(waitlistEntry));
            const priorityScore = this.calculatePriorityScore(waitlistEntry);
            await this.redis.zadd(`waitlist:priority:${entry.appointmentType}`, priorityScore, waitlistEntry.id);
            await this.redis.zadd('waitlist:expiry', Date.now() + (ttl * 1000), waitlistEntry.id);
            shared_utils_1.logger.info('Patient added to waitlist', {
                waitlistId: waitlistEntry.id,
                patientId: entry.patientId,
                appointmentType: entry.appointmentType,
                priority: entry.priority
            });
            return waitlistEntry;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to add patient to waitlist', { error, entry });
            throw new Error('Failed to add to waitlist');
        }
    }
    async notifyWaitlistForCancelledSlot(criteria) {
        try {
            const matches = await this.findWaitlistMatches(criteria);
            if (matches.length === 0) {
                shared_utils_1.logger.info('No waitlist matches found for cancelled slot', { criteria });
                return [];
            }
            const sortedMatches = matches.sort((a, b) => {
                if (a.matchScore !== b.matchScore) {
                    return b.matchScore - a.matchScore;
                }
                return this.calculatePriorityScore(a.entry) - this.calculatePriorityScore(b.entry);
            });
            const notificationCount = criteria.appointmentType === 'urgent' ? 3 : 2;
            const notifications = [];
            for (const match of sortedMatches.slice(0, notificationCount)) {
                const notification = await this.sendWaitlistNotification(match, criteria);
                if (notification) {
                    notifications.push(notification);
                }
            }
            shared_utils_1.logger.info('Waitlist notifications sent for cancelled slot', {
                criteria,
                notificationsSent: notifications.length,
                totalMatches: matches.length
            });
            return notifications;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to notify waitlist for cancelled slot', { error, criteria });
            return [];
        }
    }
    async findWaitlistMatches(criteria) {
        try {
            const waitlistIds = await this.redis.zrevrange(`waitlist:priority:${criteria.appointmentType}`, 0, 50);
            const matches = [];
            const slotDate = new Date(criteria.datetime);
            const slotDay = slotDate.toISOString().split('T')[0];
            for (const waitlistId of waitlistIds) {
                const entry = await this.getWaitlistEntry(waitlistId);
                if (!entry)
                    continue;
                const matchScore = this.calculateMatchScore(entry, criteria, slotDate);
                if (matchScore > 0.3) {
                    matches.push({
                        entry,
                        matchScore,
                        matchReasons: this.getMatchReasons(entry, criteria, slotDate),
                        estimatedResponse: this.estimateResponseTime(entry)
                    });
                }
            }
            return matches;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to find waitlist matches', { error, criteria });
            return [];
        }
    }
    calculateMatchScore(entry, criteria, slotDate) {
        let score = 0;
        const slotDay = slotDate.toISOString().split('T')[0];
        if (entry.preferredDates.includes(slotDay)) {
            score += 0.4;
        }
        else {
            const slotTime = slotDate.getTime();
            const hasNearbyDate = entry.preferredDates.some(prefDate => {
                const prefTime = new Date(prefDate).getTime();
                const daysDiff = Math.abs(slotTime - prefTime) / (1000 * 60 * 60 * 24);
                return daysDiff <= 3;
            });
            if (hasNearbyDate)
                score += 0.2;
        }
        const slotHour = slotDate.getHours();
        const timeOfDay = this.getTimeOfDay(slotHour);
        if (entry.preferredTimeOfDay === timeOfDay) {
            score += 0.25;
        }
        else if (!entry.preferredTimeOfDay) {
            score += 0.15;
        }
        if (entry.preferredProvider === criteria.practitionerId) {
            score += 0.2;
        }
        else if (!entry.preferredProvider) {
            score += 0.1;
        }
        const priorityBonus = {
            'urgent': 0.15,
            'high': 0.12,
            'normal': 0.08,
            'low': 0.05
        };
        score += priorityBonus[entry.priority];
        return Math.min(score, 1.0);
    }
    async sendWaitlistNotification(match, criteria) {
        try {
            const { entry } = match;
            const slotDate = new Date(criteria.datetime);
            if (entry.notificationPreferences.businessHoursOnly && !this.isBusinessHours(slotDate)) {
                shared_utils_1.logger.info('Delaying waitlist notification to business hours', {
                    waitlistId: entry.id,
                    currentTime: new Date().toISOString()
                });
                return null;
            }
            const notification = {
                id: this.generateNotificationId(),
                waitlistEntryId: entry.id,
                availableSlot: {
                    datetime: criteria.datetime,
                    practitioner: 'TBD',
                    practitionerId: criteria.practitionerId,
                    duration: criteria.duration,
                    appointmentType: criteria.appointmentType,
                    available: true
                },
                notificationMethod: entry.notificationPreferences.methods[0],
                sentAt: new Date().toISOString(),
                responseDeadline: this.calculateResponseDeadline(entry),
                status: 'sent',
                attempts: 1,
                maxAttempts: 3
            };
            await this.storeWaitlistNotification(notification);
            const success = await this.sendNotification(entry, notification, criteria);
            if (success) {
                notification.status = 'delivered';
                await this.storeWaitlistNotification(notification);
                shared_utils_1.logger.info('Waitlist notification sent successfully', {
                    notificationId: notification.id,
                    waitlistId: entry.id,
                    method: notification.notificationMethod
                });
            }
            return notification;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to send waitlist notification', { error, match, criteria });
            return null;
        }
    }
    async processWaitlistResponse(notificationId, response) {
        try {
            const notification = await this.getWaitlistNotification(notificationId);
            if (!notification) {
                shared_utils_1.logger.warn('Waitlist notification not found', { notificationId });
                return false;
            }
            notification.response = response;
            notification.status = 'responded';
            await this.storeWaitlistNotification(notification);
            if (response === 'accepted') {
                await this.removeFromWaitlist(notification.waitlistEntryId);
                shared_utils_1.logger.info('Waitlist response processed - accepted', {
                    notificationId,
                    waitlistId: notification.waitlistEntryId
                });
                return true;
            }
            else {
                await this.recordDeclinedSlot(notification.waitlistEntryId, notification.availableSlot);
                shared_utils_1.logger.info('Waitlist response processed - declined', {
                    notificationId,
                    waitlistId: notification.waitlistEntryId
                });
            }
            return true;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to process waitlist response', { error, notificationId, response });
            return false;
        }
    }
    async cleanupExpiredEntries() {
        try {
            const now = Date.now();
            const expiredIds = await this.redis.zrangebyscore('waitlist:expiry', 0, now);
            let removedCount = 0;
            for (const waitlistId of expiredIds) {
                await this.removeFromWaitlist(waitlistId);
                removedCount++;
            }
            if (removedCount > 0) {
                shared_utils_1.logger.info('Cleaned up expired waitlist entries', { removedCount });
            }
            return removedCount;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to cleanup expired waitlist entries', { error });
            return 0;
        }
    }
    generateWaitlistId() {
        return `wl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    generateNotificationId() {
        return `wn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    calculatePriorityScore(entry) {
        const baseScore = Date.now() - new Date(entry.createdAt).getTime();
        const priorityMultiplier = {
            'urgent': 4,
            'high': 3,
            'normal': 2,
            'low': 1
        };
        return baseScore * priorityMultiplier[entry.priority];
    }
    getTimeOfDay(hour) {
        if (hour < 12)
            return 'morning';
        if (hour < 17)
            return 'afternoon';
        return 'evening';
    }
    getMatchReasons(entry, criteria, slotDate) {
        const reasons = [];
        const slotDay = slotDate.toISOString().split('T')[0];
        if (entry.preferredDates.includes(slotDay)) {
            reasons.push('Exact date match');
        }
        const timeOfDay = this.getTimeOfDay(slotDate.getHours());
        if (entry.preferredTimeOfDay === timeOfDay) {
            reasons.push(`Preferred ${timeOfDay} time`);
        }
        if (entry.preferredProvider === criteria.practitionerId) {
            reasons.push('Preferred provider');
        }
        if (entry.priority === 'urgent') {
            reasons.push('Urgent priority');
        }
        return reasons;
    }
    estimateResponseTime(entry) {
        if (entry.notificationPreferences.immediateNotify) {
            return 'immediate';
        }
        if (entry.priority === 'urgent' || entry.priority === 'high') {
            return 'quick';
        }
        return 'delayed';
    }
    calculateResponseDeadline(entry) {
        const now = new Date();
        const deadline = new Date(now);
        if (entry.notificationPreferences.businessHoursOnly) {
            deadline.setHours(deadline.getHours() + 4);
        }
        else {
            deadline.setHours(deadline.getHours() + 2);
        }
        return deadline.toISOString();
    }
    isBusinessHours(date) {
        const hour = date.getHours();
        const day = date.getDay();
        return day >= 1 && day <= 5 && hour >= 8 && hour <= 17;
    }
    async sendNotification(entry, notification, criteria) {
        try {
            const slotDate = new Date(criteria.datetime);
            const message = this.generateNotificationMessage(entry, slotDate, criteria);
            shared_utils_1.logger.info('Sending waitlist notification', {
                method: notification.notificationMethod,
                patientId: entry.patientId,
                message: message.substring(0, 100) + '...'
            });
            return true;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to send notification', { error, entry, notification });
            return false;
        }
    }
    generateNotificationMessage(entry, slotDate, criteria) {
        const formattedDate = slotDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        return `Good news! An earlier ${criteria.appointmentType} appointment is now available on ${formattedDate}. ` +
            `This matches your waitlist preferences. Please respond within 2 hours to secure this appointment. ` +
            `Call us at (555) 123-4567 or reply to this message with YES to accept or NO to decline.`;
    }
    async getWaitlistEntry(waitlistId) {
        try {
            const data = await this.redis.get(`waitlist:${waitlistId}`);
            return data ? JSON.parse(data) : null;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to get waitlist entry', { error, waitlistId });
            return null;
        }
    }
    async getWaitlistNotification(notificationId) {
        try {
            const data = await this.redis.get(`waitlist:notification:${notificationId}`);
            return data ? JSON.parse(data) : null;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to get waitlist notification', { error, notificationId });
            return null;
        }
    }
    async storeWaitlistNotification(notification) {
        try {
            const key = `waitlist:notification:${notification.id}`;
            await this.redis.setex(key, 86400 * 7, JSON.stringify(notification));
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to store waitlist notification', { error, notification });
        }
    }
    async removeFromWaitlist(waitlistId) {
        try {
            const entry = await this.getWaitlistEntry(waitlistId);
            if (entry) {
                await this.redis.del(`waitlist:${waitlistId}`);
                await this.redis.zrem(`waitlist:priority:${entry.appointmentType}`, waitlistId);
                await this.redis.zrem('waitlist:expiry', waitlistId);
                shared_utils_1.logger.info('Removed patient from waitlist', { waitlistId, patientId: entry.patientId });
            }
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to remove from waitlist', { error, waitlistId });
        }
    }
    async recordDeclinedSlot(waitlistId, slot) {
        try {
            const key = `waitlist:declined:${waitlistId}`;
            const declined = await this.redis.lrange(key, 0, -1);
            declined.push(JSON.stringify({ slot, declinedAt: new Date().toISOString() }));
            if (declined.length > 10) {
                await this.redis.ltrim(key, -10, -1);
            }
            else {
                await this.redis.rpush(key, JSON.stringify({ slot, declinedAt: new Date().toISOString() }));
            }
            await this.redis.expire(key, 86400 * 30);
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to record declined slot', { error, waitlistId, slot });
        }
    }
}
exports.WaitlistManagementService = WaitlistManagementService;
//# sourceMappingURL=waitlist-management-service.js.map