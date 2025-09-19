"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffNotificationService = void 0;
const shared_utils_1 = require("@voice-agent/shared-utils");
class StaffNotificationService {
    redis;
    webSocketService;
    constructor(redis, webSocketService) {
        this.redis = redis;
        this.webSocketService = webSocketService;
    }
    async notifyStaffOfCancellation(appointment, confirmation, isEmergency = false, isLateNotice = false) {
        try {
            const notification = this.createCancellationNotification(appointment, confirmation, isEmergency, isLateNotice);
            await this.storeStaffNotification(notification);
            await this.sendRealTimeNotification(notification);
            await this.addToDepartmentQueue(notification);
            shared_utils_1.logger.info('Staff notification created for cancellation', {
                notificationId: notification.id,
                appointmentId: appointment.id,
                type: notification.type,
                priority: notification.priority,
                department: notification.department
            });
            return notification;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to notify staff of cancellation', { error, appointment, confirmation });
            throw new Error('Failed to create staff notification');
        }
    }
    async notifyStaffOfWaitlistResponse(waitlistEntry, response, availableSlot) {
        try {
            const notification = {
                id: this.generateNotificationId(),
                type: 'waitlist_response',
                priority: this.determineWaitlistResponsePriority(response, waitlistEntry),
                title: this.generateWaitlistResponseTitle(response, waitlistEntry),
                message: this.generateWaitlistResponseMessage(response, waitlistEntry, availableSlot),
                waitlistEntryId: waitlistEntry.id,
                patientId: waitlistEntry.patientId,
                requiresAction: response === 'accepted' || response === 'no_response',
                actionType: response === 'accepted' ? 'follow_up' : 'reschedule_assistance',
                createdAt: new Date().toISOString(),
                department: 'reception',
                acknowledged: false,
                resolved: false
            };
            await this.storeStaffNotification(notification);
            await this.sendRealTimeNotification(notification);
            await this.addToDepartmentQueue(notification);
            shared_utils_1.logger.info('Staff notification created for waitlist response', {
                notificationId: notification.id,
                waitlistEntryId: waitlistEntry.id,
                response,
                priority: notification.priority
            });
            return notification;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to notify staff of waitlist response', { error, waitlistEntry, response });
            throw new Error('Failed to create waitlist response notification');
        }
    }
    async acknowledgeNotification(notificationId, staffMemberId, staffMemberName) {
        try {
            const notification = await this.getStaffNotification(notificationId);
            if (!notification) {
                shared_utils_1.logger.warn('Staff notification not found for acknowledgment', { notificationId });
                return false;
            }
            notification.acknowledged = true;
            notification.acknowledgedBy = staffMemberName;
            notification.acknowledgedAt = new Date().toISOString();
            await this.storeStaffNotification(notification);
            if (notification.priority === 'critical' || notification.priority === 'high') {
                await this.removeFromUrgentQueue(notificationId);
            }
            await this.sendAcknowledgmentUpdate(notification, staffMemberId);
            shared_utils_1.logger.info('Staff notification acknowledged', {
                notificationId,
                acknowledgedBy: staffMemberName,
                type: notification.type
            });
            return true;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to acknowledge staff notification', { error, notificationId });
            return false;
        }
    }
    async resolveNotification(notificationId, staffMemberId, staffMemberName, notes) {
        try {
            const notification = await this.getStaffNotification(notificationId);
            if (!notification) {
                shared_utils_1.logger.warn('Staff notification not found for resolution', { notificationId });
                return false;
            }
            notification.resolved = true;
            notification.resolvedBy = staffMemberName;
            notification.resolvedAt = new Date().toISOString();
            if (notes) {
                notification.notes = notes;
            }
            await this.storeStaffNotification(notification);
            await this.removeFromAllQueues(notificationId, notification.department);
            await this.sendResolutionUpdate(notification, staffMemberId);
            shared_utils_1.logger.info('Staff notification resolved', {
                notificationId,
                resolvedBy: staffMemberName,
                type: notification.type,
                notes: notes?.substring(0, 50)
            });
            return true;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to resolve staff notification', { error, notificationId });
            return false;
        }
    }
    async getActiveNotifications(department, priority, limit = 50) {
        try {
            let queueKey = 'staff:notifications:active';
            if (department) {
                queueKey = `staff:notifications:department:${department}`;
            }
            if (priority) {
                queueKey += `:${priority}`;
            }
            const notificationIds = await this.redis.lrange(queueKey, 0, limit - 1);
            const notifications = [];
            for (const id of notificationIds) {
                const notification = await this.getStaffNotification(id);
                if (notification && !notification.resolved) {
                    notifications.push(notification);
                }
            }
            return notifications.sort((a, b) => {
                const priorityOrder = { 'critical': 4, 'high': 3, 'normal': 2, 'low': 1 };
                const aPriority = priorityOrder[a.priority];
                const bPriority = priorityOrder[b.priority];
                if (aPriority !== bPriority) {
                    return bPriority - aPriority;
                }
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to get active notifications', { error, department, priority });
            return [];
        }
    }
    async getNotificationMetrics(timeframe = 'day') {
        try {
            const timeframeDuration = {
                'hour': 60 * 60 * 1000,
                'day': 24 * 60 * 60 * 1000,
                'week': 7 * 24 * 60 * 60 * 1000
            };
            const startTime = Date.now() - timeframeDuration[timeframe];
            const metricKey = `staff:metrics:${timeframe}:${Math.floor(Date.now() / timeframeDuration[timeframe])}`;
            const cachedMetrics = await this.redis.get(metricKey);
            if (cachedMetrics) {
                return JSON.parse(cachedMetrics);
            }
            const notificationIds = await this.redis.zrangebyscore('staff:notifications:timeline', startTime, Date.now());
            const metrics = {
                totalNotifications: 0,
                byType: {},
                byPriority: {},
                byDepartment: {},
                averageAcknowledgmentTime: 0,
                averageResolutionTime: 0,
                unacknowledgedCount: 0,
                unresolvedCount: 0
            };
            let totalAckTime = 0;
            let totalResTime = 0;
            let ackCount = 0;
            let resCount = 0;
            for (const id of notificationIds) {
                const notification = await this.getStaffNotification(id);
                if (!notification)
                    continue;
                metrics.totalNotifications++;
                metrics.byType[notification.type] = (metrics.byType[notification.type] || 0) + 1;
                metrics.byPriority[notification.priority] = (metrics.byPriority[notification.priority] || 0) + 1;
                if (notification.department) {
                    metrics.byDepartment[notification.department] = (metrics.byDepartment[notification.department] || 0) + 1;
                }
                if (!notification.acknowledged) {
                    metrics.unacknowledgedCount++;
                }
                else if (notification.acknowledgedAt) {
                    const ackTime = new Date(notification.acknowledgedAt).getTime() - new Date(notification.createdAt).getTime();
                    totalAckTime += ackTime;
                    ackCount++;
                }
                if (!notification.resolved) {
                    metrics.unresolvedCount++;
                }
                else if (notification.resolvedAt) {
                    const resTime = new Date(notification.resolvedAt).getTime() - new Date(notification.createdAt).getTime();
                    totalResTime += resTime;
                    resCount++;
                }
            }
            metrics.averageAcknowledgmentTime = ackCount > 0 ? Math.round(totalAckTime / ackCount / 1000 / 60) : 0;
            metrics.averageResolutionTime = resCount > 0 ? Math.round(totalResTime / resCount / 1000 / 60) : 0;
            await this.redis.setex(metricKey, 300, JSON.stringify(metrics));
            return metrics;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to get notification metrics', { error, timeframe });
            return {
                totalNotifications: 0,
                byType: {},
                byPriority: {},
                byDepartment: {},
                averageAcknowledgmentTime: 0,
                averageResolutionTime: 0,
                unacknowledgedCount: 0,
                unresolvedCount: 0
            };
        }
    }
    createCancellationNotification(appointment, confirmation, isEmergency, isLateNotice) {
        const priority = this.determineCancellationPriority(appointment, isEmergency, isLateNotice);
        const type = isEmergency ? 'emergency_cancellation' :
            isLateNotice ? 'late_cancellation' : 'cancellation';
        return {
            id: this.generateNotificationId(),
            type,
            priority,
            title: this.generateCancellationTitle(appointment, isEmergency, isLateNotice),
            message: this.generateCancellationMessage(appointment, confirmation, isEmergency, isLateNotice),
            appointmentId: appointment.id,
            patientId: appointment.patientId,
            requiresAction: this.requiresStaffAction(appointment, isEmergency, isLateNotice),
            actionType: this.determineActionType(appointment, isEmergency, isLateNotice),
            createdAt: new Date().toISOString(),
            department: this.determineDepartment(appointment, isEmergency, isLateNotice),
            acknowledged: false,
            resolved: false
        };
    }
    determineCancellationPriority(appointment, isEmergency, isLateNotice) {
        if (isEmergency)
            return 'critical';
        if (isLateNotice && appointment.type === 'urgent')
            return 'high';
        if (isLateNotice)
            return 'normal';
        if (appointment.type === 'urgent')
            return 'normal';
        return 'low';
    }
    determineWaitlistResponsePriority(response, waitlistEntry) {
        if (response === 'accepted' && waitlistEntry.priority === 'urgent')
            return 'high';
        if (response === 'accepted')
            return 'normal';
        if (response === 'no_response' && waitlistEntry.priority === 'urgent')
            return 'normal';
        return 'low';
    }
    generateCancellationTitle(appointment, isEmergency, isLateNotice) {
        if (isEmergency)
            return `EMERGENCY: ${appointment.type} appointment cancelled`;
        if (isLateNotice)
            return `Late cancellation: ${appointment.type} appointment`;
        return `Appointment cancelled: ${appointment.type}`;
    }
    generateWaitlistResponseTitle(response, waitlistEntry) {
        switch (response) {
            case 'accepted':
                return `Waitlist accepted: ${waitlistEntry.appointmentType} appointment`;
            case 'declined':
                return `Waitlist declined: ${waitlistEntry.appointmentType} appointment`;
            case 'no_response':
                return `No waitlist response: ${waitlistEntry.appointmentType} appointment`;
            default:
                return `Waitlist update: ${waitlistEntry.appointmentType} appointment`;
        }
    }
    generateCancellationMessage(appointment, confirmation, isEmergency, isLateNotice) {
        const formattedDate = new Date(appointment.datetime).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        let message = `Patient ${appointment.patientName} has cancelled their ${appointment.type} appointment `;
        message += `with ${appointment.practitionerName} on ${formattedDate}. `;
        if (isEmergency) {
            message += `This was marked as an EMERGENCY cancellation. `;
            if (confirmation.reason) {
                message += `Reason: ${confirmation.reason}. `;
            }
        }
        else if (isLateNotice) {
            message += `This is a late notice cancellation. `;
            if (confirmation.cancellationFee && confirmation.cancellationFee > 0) {
                message += `Cancellation fee: $${confirmation.cancellationFee}. `;
            }
        }
        message += `Reference: ${confirmation.referenceNumber}. `;
        if (confirmation.waitlistNotified && confirmation.waitlistNotificationCount > 0) {
            message += `${confirmation.waitlistNotificationCount} waitlisted patients have been notified.`;
        }
        else {
            message += `No waitlisted patients to notify.`;
        }
        return message;
    }
    generateWaitlistResponseMessage(response, waitlistEntry, availableSlot) {
        const slotDate = new Date(availableSlot.datetime).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        switch (response) {
            case 'accepted':
                return `Patient ${waitlistEntry.patientName} has ACCEPTED the waitlist offer for ${slotDate}. Please process the appointment booking and confirm with the patient.`;
            case 'declined':
                return `Patient ${waitlistEntry.patientName} has declined the waitlist offer for ${slotDate}. The slot remains available for other patients.`;
            case 'no_response':
                return `Patient ${waitlistEntry.patientName} has not responded to the waitlist offer for ${slotDate}. The deadline has passed. Consider calling the patient directly.`;
            default:
                return `Waitlist update for patient ${waitlistEntry.patientName} regarding ${slotDate} slot.`;
        }
    }
    requiresStaffAction(appointment, isEmergency, isLateNotice) {
        return isEmergency || isLateNotice || appointment.type === 'urgent';
    }
    determineActionType(appointment, isEmergency, isLateNotice) {
        if (isEmergency)
            return 'follow_up';
        if (isLateNotice)
            return 'billing_review';
        if (appointment.type === 'urgent')
            return 'reschedule_assistance';
        return 'chart_update';
    }
    determineDepartment(appointment, isEmergency, isLateNotice) {
        if (isEmergency)
            return 'medical';
        if (isLateNotice)
            return 'billing';
        return 'reception';
    }
    generateNotificationId() {
        return `sn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    async storeStaffNotification(notification) {
        try {
            const key = `staff:notification:${notification.id}`;
            await this.redis.setex(key, 86400 * 30, JSON.stringify(notification));
            await this.redis.zadd('staff:notifications:timeline', new Date(notification.createdAt).getTime(), notification.id);
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to store staff notification', { error, notification });
            throw error;
        }
    }
    async getStaffNotification(notificationId) {
        try {
            const key = `staff:notification:${notificationId}`;
            const data = await this.redis.get(key);
            return data ? JSON.parse(data) : null;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to get staff notification', { error, notificationId });
            return null;
        }
    }
    async sendRealTimeNotification(notification) {
        try {
            shared_utils_1.logger.info('Sending real-time staff notification', {
                notificationId: notification.id,
                type: notification.type,
                priority: notification.priority,
                department: notification.department
            });
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to send real-time notification', { error, notification });
        }
    }
    async addToDepartmentQueue(notification) {
        try {
            const queueKeys = [
                'staff:notifications:active',
                `staff:notifications:department:${notification.department}`,
                `staff:notifications:priority:${notification.priority}`
            ];
            for (const queueKey of queueKeys) {
                await this.redis.lpush(queueKey, notification.id);
                await this.redis.expire(queueKey, 86400 * 30);
            }
            if (notification.priority === 'critical' || notification.priority === 'high') {
                await this.redis.lpush('staff:notifications:urgent', notification.id);
                await this.redis.expire('staff:notifications:urgent', 86400 * 7);
            }
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to add notification to department queue', { error, notification });
        }
    }
    async removeFromUrgentQueue(notificationId) {
        try {
            await this.redis.lrem('staff:notifications:urgent', 0, notificationId);
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to remove from urgent queue', { error, notificationId });
        }
    }
    async removeFromAllQueues(notificationId, department) {
        try {
            const queueKeys = [
                'staff:notifications:active',
                `staff:notifications:department:${department}`,
                'staff:notifications:urgent'
            ];
            for (const queueKey of queueKeys) {
                await this.redis.lrem(queueKey, 0, notificationId);
            }
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to remove from all queues', { error, notificationId, department });
        }
    }
    async sendAcknowledgmentUpdate(notification, staffMemberId) {
        try {
            shared_utils_1.logger.info('Sending acknowledgment update', {
                notificationId: notification.id,
                staffMemberId
            });
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to send acknowledgment update', { error, notification, staffMemberId });
        }
    }
    async sendResolutionUpdate(notification, staffMemberId) {
        try {
            shared_utils_1.logger.info('Sending resolution update', {
                notificationId: notification.id,
                staffMemberId
            });
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to send resolution update', { error, notification, staffMemberId });
        }
    }
}
exports.StaffNotificationService = StaffNotificationService;
//# sourceMappingURL=staff-notification-service.js.map