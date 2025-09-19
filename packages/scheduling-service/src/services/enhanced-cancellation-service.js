"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedCancellationService = void 0;
const shared_utils_1 = require("@voice-agent/shared-utils");
class EnhancedCancellationService {
    appointmentService;
    waitlistService;
    confirmationService;
    staffNotificationService;
    redis;
    constructor(appointmentService, waitlistService, confirmationService, staffNotificationService, redis) {
        this.appointmentService = appointmentService;
        this.waitlistService = waitlistService;
        this.confirmationService = confirmationService;
        this.staffNotificationService = staffNotificationService;
        this.redis = redis;
    }
    async processCancellation(request) {
        try {
            shared_utils_1.logger.info('Starting enhanced cancellation process', {
                appointmentId: request.appointmentId,
                patientId: request.patientId,
                emergency: request.emergency,
                conversationId: request.conversationId
            });
            const appointment = await this.getAndValidateAppointment(request);
            if (!appointment) {
                return {
                    success: false,
                    message: "I couldn't find that appointment. Please check your confirmation number and try again.",
                    error: 'Appointment not found or invalid'
                };
            }
            if (request.emergency) {
                return await this.processEmergencyCancellation(appointment, request);
            }
            const cancellationResult = await this.appointmentService.modifyAppointment({
                appointmentId: request.appointmentId,
                patientId: request.patientId,
                modificationType: 'cancel',
                reason: request.reason,
                conversationId: request.conversationId
            });
            if (!cancellationResult.success) {
                return {
                    success: false,
                    message: cancellationResult.message,
                    error: cancellationResult.error
                };
            }
            const confirmation = await this.confirmationService.createCancellationConfirmation(appointment, request, cancellationResult.cancellationFee);
            const confirmationResponse = await this.confirmationService.deliverConfirmation(confirmation, request);
            const waitlistResults = await this.notifyWaitlist(appointment);
            await this.confirmationService.updateWaitlistNotificationStatus(confirmation.referenceNumber, waitlistResults.length > 0, waitlistResults.length);
            const isLateNotice = this.isLateNotice(appointment);
            const staffNotification = await this.staffNotificationService.notifyStaffOfCancellation(appointment, confirmation, false, isLateNotice);
            const response = {
                success: true,
                message: confirmationResponse.message,
                referenceNumber: confirmation.referenceNumber,
                cancellationFee: cancellationResult.cancellationFee,
                waitlistNotified: waitlistResults.length > 0,
                waitlistCount: waitlistResults.length,
                confirmationDelivery: confirmationResponse.confirmationDelivery,
                staffNotificationSent: true,
                emergencyProtocolActivated: false
            };
            shared_utils_1.logger.info('Enhanced cancellation completed successfully', {
                appointmentId: request.appointmentId,
                referenceNumber: confirmation.referenceNumber,
                waitlistNotified: waitlistResults.length,
                staffNotificationId: staffNotification.id
            });
            return response;
        }
        catch (error) {
            shared_utils_1.logger.error('Enhanced cancellation process failed', { error, request });
            return {
                success: false,
                message: "I'm having trouble processing your cancellation right now. Please try again or speak with our staff for assistance.",
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    async processEmergencyCancellation(appointment, request) {
        try {
            shared_utils_1.logger.info('Processing emergency cancellation', {
                appointmentId: appointment.id,
                emergencyReason: request.emergencyReason
            });
            const emergencyReason = request.emergencyReason || 'Medical emergency';
            const cancellationResult = await this.appointmentService.modifyAppointment({
                appointmentId: request.appointmentId,
                patientId: request.patientId,
                modificationType: 'cancel',
                reason: `EMERGENCY: ${emergencyReason}`,
                conversationId: request.conversationId
            });
            if (!cancellationResult.success) {
                return {
                    success: false,
                    message: "I'm having trouble cancelling your appointment. Please call our office immediately for emergency assistance at (555) 123-4567.",
                    error: cancellationResult.error,
                    emergencyProtocolActivated: true
                };
            }
            const confirmation = await this.confirmationService.createCancellationConfirmation(appointment, request, 0);
            const confirmationResponse = await this.confirmationService.deliverConfirmation(confirmation, {
                ...request,
                preferredConfirmationMethods: ['voice', 'sms']
            });
            const waitlistResults = await this.notifyWaitlistUrgent(appointment);
            const staffNotification = await this.staffNotificationService.notifyStaffOfCancellation(appointment, confirmation, true, false);
            await this.confirmationService.updateWaitlistNotificationStatus(confirmation.referenceNumber, waitlistResults.length > 0, waitlistResults.length);
            const response = {
                success: true,
                message: this.generateEmergencyConfirmationMessage(confirmation, waitlistResults.length),
                referenceNumber: confirmation.referenceNumber,
                cancellationFee: 0,
                waitlistNotified: waitlistResults.length > 0,
                waitlistCount: waitlistResults.length,
                confirmationDelivery: confirmationResponse.confirmationDelivery,
                staffNotificationSent: true,
                emergencyProtocolActivated: true
            };
            shared_utils_1.logger.info('Emergency cancellation completed', {
                appointmentId: appointment.id,
                referenceNumber: confirmation.referenceNumber,
                waitlistNotified: waitlistResults.length,
                staffNotificationId: staffNotification.id
            });
            return response;
        }
        catch (error) {
            shared_utils_1.logger.error('Emergency cancellation failed', { error, appointment, request });
            return {
                success: false,
                message: "I understand this is an emergency. I'm having trouble with the cancellation system. Please call our office immediately at (555) 123-4567 for urgent assistance.",
                error: error instanceof Error ? error.message : 'Emergency processing error',
                emergencyProtocolActivated: true
            };
        }
    }
    async notifyWaitlist(appointment) {
        try {
            const matchingCriteria = {
                appointmentType: appointment.type,
                datetime: appointment.datetime,
                practitionerId: appointment.practitionerId,
                duration: appointment.duration
            };
            const notifications = await this.waitlistService.notifyWaitlistForCancelledSlot(matchingCriteria);
            shared_utils_1.logger.info('Waitlist notifications sent for cancelled appointment', {
                appointmentId: appointment.id,
                notificationCount: notifications.length
            });
            return notifications;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to notify waitlist for cancelled appointment', { error, appointment });
            return [];
        }
    }
    async notifyWaitlistUrgent(appointment) {
        try {
            const matchingCriteria = {
                appointmentType: appointment.type,
                datetime: appointment.datetime,
                practitionerId: appointment.practitionerId,
                duration: appointment.duration
            };
            const notifications = await this.waitlistService.notifyWaitlistForCancelledSlot(matchingCriteria);
            shared_utils_1.logger.info('Urgent waitlist notifications sent for emergency cancellation', {
                appointmentId: appointment.id,
                notificationCount: notifications.length
            });
            return notifications;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to send urgent waitlist notifications', { error, appointment });
            return [];
        }
    }
    async getAndValidateAppointment(request) {
        try {
            const appointmentKey = `appointment:${request.appointmentId}`;
            const data = await this.redis.get(appointmentKey);
            if (!data) {
                shared_utils_1.logger.warn('Appointment not found for cancellation', { appointmentId: request.appointmentId });
                return null;
            }
            const appointment = JSON.parse(data);
            if (appointment.patientId !== request.patientId) {
                shared_utils_1.logger.warn('Appointment ownership validation failed', {
                    appointmentId: request.appointmentId,
                    requestPatientId: request.patientId,
                    appointmentPatientId: appointment.patientId
                });
                return null;
            }
            if (appointment.status === 'cancelled') {
                shared_utils_1.logger.warn('Attempted to cancel already cancelled appointment', { appointmentId: request.appointmentId });
                return null;
            }
            if (!request.emergency && new Date(appointment.datetime) < new Date()) {
                shared_utils_1.logger.warn('Attempted to cancel past appointment', { appointmentId: request.appointmentId });
                return null;
            }
            return appointment;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to get and validate appointment', { error, request });
            return null;
        }
    }
    isLateNotice(appointment) {
        const appointmentTime = new Date(appointment.datetime);
        const now = new Date();
        const hoursUntil = (appointmentTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        return hoursUntil < 24;
    }
    generateEmergencyConfirmationMessage(confirmation, waitlistCount) {
        const appointment = confirmation.originalAppointment;
        const formattedDate = new Date(appointment.datetime).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        let message = `I understand this is an emergency situation. I've immediately cancelled your ${appointment.type} appointment `;
        message += `with ${appointment.practitionerName} on ${formattedDate}. `;
        message += `There is no cancellation fee for emergency situations. `;
        message += `Your emergency cancellation reference number is ${confirmation.referenceNumber}. `;
        message += `I've notified our staff about this emergency cancellation, and they may contact you to offer assistance. `;
        if (waitlistCount > 0) {
            message += `I've also notified ${waitlistCount} patients on our waitlist about this available appointment time. `;
        }
        message += `If you need immediate medical attention, please contact your healthcare provider or call 911. `;
        message += `When you're ready to reschedule, please call our office at (555) 123-4567. `;
        message += `Is there anything else I can help you with during this emergency situation?`;
        return message;
    }
    async getCancellationByReference(referenceNumber) {
        try {
            return await this.confirmationService.getCancellationConfirmation(referenceNumber);
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to get cancellation by reference', { error, referenceNumber });
            return null;
        }
    }
    async processWaitlistResponse(notificationId, response) {
        try {
            return await this.waitlistService.processWaitlistResponse(notificationId, response);
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to process waitlist response', { error, notificationId, response });
            return false;
        }
    }
    async getActiveStaffNotifications(department) {
        try {
            return await this.staffNotificationService.getActiveNotifications(department);
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to get active staff notifications', { error, department });
            return [];
        }
    }
    async getCancellationMetrics(timeframe = 'day') {
        try {
            return {
                totalCancellations: 0,
                emergencyCancellations: 0,
                lateCancellations: 0,
                totalWaitlistNotifications: 0,
                averageWaitlistResponseRate: 0,
                totalCancellationFees: 0,
                averageStaffResponseTime: 0
            };
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to get cancellation metrics', { error, timeframe });
            return {
                totalCancellations: 0,
                emergencyCancellations: 0,
                lateCancellations: 0,
                totalWaitlistNotifications: 0,
                averageWaitlistResponseRate: 0,
                totalCancellationFees: 0,
                averageStaffResponseTime: 0
            };
        }
    }
}
exports.EnhancedCancellationService = EnhancedCancellationService;
//# sourceMappingURL=enhanced-cancellation-service.js.map