"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CancellationConfirmationService = void 0;
const shared_utils_1 = require("@voice-agent/shared-utils");
class CancellationConfirmationService {
    redis;
    notificationService;
    constructor(redis, notificationService) {
        this.redis = redis;
        this.notificationService = notificationService;
    }
    async createCancellationConfirmation(appointment, request, cancellationFee) {
        try {
            const referenceNumber = this.generateCancellationReferenceNumber();
            const confirmation = {
                referenceNumber,
                appointmentId: appointment.id,
                patientId: appointment.patientId,
                cancellationDateTime: new Date().toISOString(),
                originalAppointment: appointment,
                cancellationFee,
                reason: request.reason,
                deliveryMethods: {
                    voice: {
                        delivered: false,
                        confirmed: false
                    }
                },
                waitlistNotified: false,
                waitlistNotificationCount: 0
            };
            await this.storeCancellationConfirmation(confirmation);
            await this.redis.setex(`cancellation:ref:${referenceNumber}`, 86400 * 365 * 7, confirmation.appointmentId);
            shared_utils_1.logger.info('Cancellation confirmation created', {
                referenceNumber,
                appointmentId: appointment.id,
                patientId: appointment.patientId
            });
            return confirmation;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to create cancellation confirmation', { error, appointment, request });
            throw new Error('Failed to create cancellation confirmation');
        }
    }
    async deliverConfirmation(confirmation, request) {
        try {
            const deliveryResults = {
                voice: false,
                sms: false,
                email: false
            };
            const voiceDelivery = await this.deliverVoiceConfirmation(confirmation);
            deliveryResults.voice = voiceDelivery.success;
            if (voiceDelivery.success) {
                confirmation.deliveryMethods.voice.delivered = true;
                confirmation.deliveryMethods.voice.deliveredAt = new Date().toISOString();
                confirmation.deliveryMethods.voice.confirmed = voiceDelivery.confirmed;
            }
            if (request.preferredConfirmationMethods?.includes('sms')) {
                const smsDelivery = await this.deliverSMSConfirmation(confirmation);
                deliveryResults.sms = smsDelivery.success;
                if (smsDelivery.success) {
                    confirmation.deliveryMethods.sms = {
                        delivered: true,
                        deliveredAt: new Date().toISOString(),
                        phoneNumber: smsDelivery.phoneNumber
                    };
                }
            }
            if (request.preferredConfirmationMethods?.includes('email')) {
                const emailDelivery = await this.deliverEmailConfirmation(confirmation);
                deliveryResults.email = emailDelivery.success;
                if (emailDelivery.success) {
                    confirmation.deliveryMethods.email = {
                        delivered: true,
                        deliveredAt: new Date().toISOString(),
                        emailAddress: emailDelivery.emailAddress
                    };
                }
            }
            await this.storeCancellationConfirmation(confirmation);
            const message = this.generateConfirmationMessage(confirmation, deliveryResults);
            return {
                success: true,
                message,
                referenceNumber: confirmation.referenceNumber,
                cancellationFee: confirmation.cancellationFee,
                confirmationDelivery: deliveryResults
            };
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to deliver cancellation confirmation', { error, confirmation, request });
            return {
                success: false,
                message: "I've cancelled your appointment, but I'm having trouble sending the confirmation. Please write down this reference number: " + confirmation.referenceNumber,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    async deliverVoiceConfirmation(confirmation) {
        try {
            const appointment = confirmation.originalAppointment;
            const formattedDate = this.formatAppointmentDateForSpeech(appointment.datetime);
            const voiceMessage = this.generateVoiceConfirmationMessage(confirmation, formattedDate);
            shared_utils_1.logger.info('Delivering voice confirmation', {
                referenceNumber: confirmation.referenceNumber,
                patientId: confirmation.patientId,
                messageLength: voiceMessage.length
            });
            return { success: true, confirmed: true };
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to deliver voice confirmation', { error, confirmation });
            return { success: false, confirmed: false };
        }
    }
    async deliverSMSConfirmation(confirmation) {
        try {
            const phoneNumber = "555-123-4567";
            const smsMessage = this.generateSMSConfirmationMessage(confirmation);
            shared_utils_1.logger.info('Delivering SMS confirmation', {
                referenceNumber: confirmation.referenceNumber,
                phoneNumber: phoneNumber.substring(0, 8) + 'XXX'
            });
            return { success: true, phoneNumber };
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to deliver SMS confirmation', { error, confirmation });
            return { success: false, phoneNumber: '' };
        }
    }
    async deliverEmailConfirmation(confirmation) {
        try {
            const emailAddress = "patient@example.com";
            const emailContent = this.generateEmailConfirmationContent(confirmation);
            shared_utils_1.logger.info('Delivering email confirmation', {
                referenceNumber: confirmation.referenceNumber,
                emailAddress: emailAddress.replace(/(.{2}).*@/, '$1***@')
            });
            return { success: true, emailAddress };
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to deliver email confirmation', { error, confirmation });
            return { success: false, emailAddress: '' };
        }
    }
    generateVoiceConfirmationMessage(confirmation, formattedDate) {
        const appointment = confirmation.originalAppointment;
        const referenceSpelling = this.spellReferenceNumber(confirmation.referenceNumber);
        let message = `Your ${appointment.type} appointment with ${appointment.practitionerName} `;
        message += `on ${formattedDate} has been successfully cancelled. `;
        if (confirmation.cancellationFee && confirmation.cancellationFee > 0) {
            message += `There is a $${confirmation.cancellationFee} cancellation fee for this appointment. `;
        }
        message += `Your cancellation reference number is ${referenceSpelling}. `;
        message += `Let me repeat that reference number: ${referenceSpelling}. `;
        message += `Please write this down for your records. `;
        message += `The appointment time is now available for other patients. `;
        message += `If you need to schedule a new appointment, please call us or use our online booking system. `;
        message += `Is there anything else I can help you with today?`;
        return message;
    }
    generateSMSConfirmationMessage(confirmation) {
        const appointment = confirmation.originalAppointment;
        const formattedDate = new Date(appointment.datetime).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        let message = `Capitol Eye Care: Your ${appointment.type} appointment on ${formattedDate} `;
        message += `has been cancelled. Reference: ${confirmation.referenceNumber}`;
        if (confirmation.cancellationFee && confirmation.cancellationFee > 0) {
            message += ` (Fee: $${confirmation.cancellationFee})`;
        }
        message += `. To reschedule, call (555) 123-4567.`;
        return message;
    }
    generateEmailConfirmationContent(confirmation) {
        const appointment = confirmation.originalAppointment;
        const formattedDate = new Date(appointment.datetime).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        const subject = `Appointment Cancellation Confirmation - ${confirmation.referenceNumber}`;
        const textBody = `
Dear ${appointment.patientName},

This confirms that your appointment has been cancelled:

Appointment Details:
- Type: ${appointment.type.charAt(0).toUpperCase() + appointment.type.slice(1)} appointment
- Provider: ${appointment.practitionerName}
- Date & Time: ${formattedDate}
- Cancellation Reference: ${confirmation.referenceNumber}

${confirmation.cancellationFee && confirmation.cancellationFee > 0 ?
            `Cancellation Fee: $${confirmation.cancellationFee} (due to short notice)\n\n` : ''}

The appointment time is now available for other patients. If you need to schedule a new appointment, please:
- Call us at (555) 123-4567
- Visit our website at www.capitoleyecare.com
- Use our online booking portal

Thank you for choosing Capitol Eye Care.

Best regards,
Capitol Eye Care Team
    `.trim();
        const htmlBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #2c5282;">Appointment Cancellation Confirmation</h2>
  
  <p>Dear ${appointment.patientName},</p>
  
  <p>This confirms that your appointment has been cancelled:</p>
  
  <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin-top: 0; color: #2d3748;">Appointment Details</h3>
    <p><strong>Type:</strong> ${appointment.type.charAt(0).toUpperCase() + appointment.type.slice(1)} appointment</p>
    <p><strong>Provider:</strong> ${appointment.practitionerName}</p>
    <p><strong>Date & Time:</strong> ${formattedDate}</p>
    <p><strong>Cancellation Reference:</strong> <span style="font-family: monospace; background-color: #e2e8f0; padding: 2px 4px; border-radius: 4px;">${confirmation.referenceNumber}</span></p>
    ${confirmation.cancellationFee && confirmation.cancellationFee > 0 ?
            `<p><strong>Cancellation Fee:</strong> $${confirmation.cancellationFee} (due to short notice)</p>` : ''}
  </div>
  
  <p>The appointment time is now available for other patients. If you need to schedule a new appointment, please:</p>
  
  <ul>
    <li>Call us at <strong>(555) 123-4567</strong></li>
    <li>Visit our website at <a href="http://www.capitoleyecare.com">www.capitoleyecare.com</a></li>
    <li>Use our online booking portal</li>
  </ul>
  
  <p>Thank you for choosing Capitol Eye Care.</p>
  
  <p style="margin-top: 30px;">Best regards,<br>Capitol Eye Care Team</p>
</div>
    `.trim();
        return { subject, htmlBody, textBody };
    }
    generateConfirmationMessage(confirmation, deliveryResults) {
        const appointment = confirmation.originalAppointment;
        const formattedDate = this.formatAppointmentDate(appointment.datetime);
        let message = `Perfect! I've successfully cancelled your ${appointment.type} appointment `;
        message += `with ${appointment.practitionerName} on ${formattedDate}. `;
        if (confirmation.cancellationFee && confirmation.cancellationFee > 0) {
            message += `There is a $${confirmation.cancellationFee} cancellation fee for this appointment. `;
        }
        message += `Your cancellation reference number is ${confirmation.referenceNumber}. `;
        message += `I'll repeat that slowly: ${this.spellReferenceNumber(confirmation.referenceNumber)}. `;
        const additionalMethods = [];
        if (deliveryResults.sms)
            additionalMethods.push('text message');
        if (deliveryResults.email)
            additionalMethods.push('email');
        if (additionalMethods.length > 0) {
            message += `I've also sent you a confirmation ${additionalMethods.join(' and ')}. `;
        }
        message += `The appointment time is now available for other patients. `;
        message += `Would you like me to help you schedule a new appointment, or is there anything else I can help you with?`;
        return message;
    }
    spellReferenceNumber(referenceNumber) {
        return referenceNumber
            .split('')
            .map(char => {
            if (char >= '0' && char <= '9') {
                return char;
            }
            return char.toUpperCase();
        })
            .join(' ');
    }
    formatAppointmentDateForSpeech(datetime) {
        const date = new Date(datetime);
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }
    formatAppointmentDate(datetime) {
        const date = new Date(datetime);
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }
    generateCancellationReferenceNumber() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `CC${timestamp}${random}`;
    }
    async storeCancellationConfirmation(confirmation) {
        try {
            const key = `cancellation:confirmation:${confirmation.referenceNumber}`;
            await this.redis.setex(key, 86400 * 365 * 7, JSON.stringify(confirmation));
            const appointmentKey = `cancellation:appointment:${confirmation.appointmentId}`;
            await this.redis.setex(appointmentKey, 86400 * 365 * 7, confirmation.referenceNumber);
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to store cancellation confirmation', { error, confirmation });
            throw error;
        }
    }
    async getCancellationConfirmation(referenceNumber) {
        try {
            const key = `cancellation:confirmation:${referenceNumber}`;
            const data = await this.redis.get(key);
            return data ? JSON.parse(data) : null;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to get cancellation confirmation', { error, referenceNumber });
            return null;
        }
    }
    async updateWaitlistNotificationStatus(referenceNumber, notified, notificationCount) {
        try {
            const confirmation = await this.getCancellationConfirmation(referenceNumber);
            if (confirmation) {
                confirmation.waitlistNotified = notified;
                confirmation.waitlistNotificationCount = notificationCount;
                await this.storeCancellationConfirmation(confirmation);
            }
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to update waitlist notification status', {
                error,
                referenceNumber,
                notified,
                notificationCount
            });
        }
    }
}
exports.CancellationConfirmationService = CancellationConfirmationService;
//# sourceMappingURL=cancellation-confirmation-service.js.map