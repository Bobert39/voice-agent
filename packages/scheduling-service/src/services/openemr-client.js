"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenEMRSchedulingClient = void 0;
class OpenEMRSchedulingClient {
    config;
    accessToken;
    refreshToken;
    tokenExpiry;
    constructor(config) {
        this.config = {
            site: 'default',
            ...config,
            scope: config.scope || 'openid offline_access api:fhir user/Appointment.read user/Appointment.write user/Slot.read user/Practitioner.read'
        };
    }
    async authenticateWithClientCredentials() {
        const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
        const data = new URLSearchParams({
            grant_type: 'client_credentials',
            scope: this.config.scope
        });
        const response = await fetch(`${this.config.baseUrl}/oauth2/${this.config.site}/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: data
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Authentication failed: ${response.statusText} - ${errorText}`);
        }
        const tokens = await response.json();
        this.setTokens(tokens);
        return tokens;
    }
    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }
        const data = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: this.config.clientId,
            refresh_token: this.refreshToken
        });
        const response = await fetch(`${this.config.baseUrl}/oauth2/${this.config.site}/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: data
        });
        if (!response.ok) {
            throw new Error(`Token refresh failed: ${response.statusText}`);
        }
        const tokens = await response.json();
        this.setTokens(tokens);
        return tokens;
    }
    async getAvailableSlotsEnhanced(startDate, endDate, practitionerId, appointmentType, includeMetadata = true) {
        await this.ensureAuthenticated();
        const params = new URLSearchParams({
            start: startDate,
            end: endDate,
            status: 'free',
            _count: '1000',
            _sort: 'start'
        });
        if (practitionerId) {
            params.append('schedule.actor', `Practitioner/${practitionerId}`);
        }
        if (appointmentType) {
            params.append('appointment-type', appointmentType);
        }
        if (includeMetadata) {
            params.append('_include', 'Slot:schedule');
            params.append('_include', 'Schedule:actor');
        }
        const response = await this.makeAuthenticatedRequest(`/fhir/Slot?${params}`);
        if (response.entry && Array.isArray(response.entry)) {
            return response.entry
                .filter((entry) => entry.resource?.resourceType === 'Slot')
                .map((entry) => this.mapToAppointmentSlot(entry.resource));
        }
        return [];
    }
    async getPractitionerCalendar(practitionerId, startDate, days = 60) {
        await this.ensureAuthenticated();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + days);
        const slots = await this.getAvailableSlotsEnhanced(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0], practitionerId);
        const calendar = new Map();
        slots.forEach(slot => {
            const dateKey = slot.start.split('T')[0];
            if (!calendar.has(dateKey)) {
                calendar.set(dateKey, []);
            }
            calendar.get(dateKey).push(slot);
        });
        return calendar;
    }
    async getBatchPractitionerSlots(practitionerIds, startDate, endDate) {
        await this.ensureAuthenticated();
        const batchRequest = {
            resourceType: 'Bundle',
            type: 'batch',
            entry: practitionerIds.map(id => ({
                request: {
                    method: 'GET',
                    url: `/Slot?schedule.actor=Practitioner/${id}&start=${startDate}&end=${endDate}&status=free`
                }
            }))
        };
        const response = await this.makeAuthenticatedRequest('/fhir', {
            method: 'POST',
            body: JSON.stringify(batchRequest)
        });
        const practitionerSlots = new Map();
        if (response.entry && Array.isArray(response.entry)) {
            response.entry.forEach((entry, index) => {
                const practitionerId = practitionerIds[index];
                const slots = entry.resource?.entry?.map((e) => this.mapToAppointmentSlot(e.resource)) || [];
                practitionerSlots.set(practitionerId, slots);
            });
        }
        return practitionerSlots;
    }
    async checkSlotAvailability(slotId) {
        await this.ensureAuthenticated();
        try {
            const response = await this.makeAuthenticatedRequest(`/fhir/Slot/${slotId}`);
            return response.status === 'free';
        }
        catch (error) {
            console.error('Error checking slot availability:', error);
            return false;
        }
    }
    mapToAppointmentSlot(fhirSlot) {
        return {
            id: fhirSlot.id,
            start: fhirSlot.start,
            end: fhirSlot.end,
            status: fhirSlot.status,
            schedule: fhirSlot.schedule?.reference,
            appointmentType: fhirSlot.appointmentType?.coding?.[0]?.display,
            operatingHours: fhirSlot.operatingHours
        };
    }
    setTokens(tokens) {
        this.accessToken = tokens.access_token;
        this.refreshToken = tokens.refresh_token;
        this.tokenExpiry = new Date(Date.now() + (tokens.expires_in * 1000));
    }
    async ensureValidToken() {
        if (!this.accessToken) {
            throw new Error('No access token available. Please authenticate first.');
        }
        if (this.tokenExpiry && this.tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000) {
            if (this.refreshToken) {
                await this.refreshAccessToken();
            }
            else {
                await this.authenticateWithClientCredentials();
            }
        }
    }
    async makeFHIRRequest(resource, options = {}) {
        await this.ensureValidToken();
        const url = `${this.config.baseUrl}/apis/${this.config.site}/fhir${resource}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/fhir+json',
                'Accept': 'application/fhir+json',
                ...options.headers
            }
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`FHIR API request failed: ${response.statusText} - ${errorText}`);
        }
        return await response.json();
    }
    async getAvailableSlots(startDate, endDate, practitionerId, appointmentType) {
        try {
            let query = `/Slot?start=ge${startDate}&start=le${endDate}&status=free`;
            if (practitionerId) {
                query += `&schedule.actor=Practitioner/${practitionerId}`;
            }
            if (appointmentType) {
                query += `&appointment-type=${appointmentType}`;
            }
            const response = await this.makeFHIRRequest(query);
            if (!response.entry) {
                return [];
            }
            return response.entry.map(entry => {
                const slot = entry.resource;
                return {
                    id: slot.id,
                    start: slot.start,
                    end: slot.end,
                    status: slot.status,
                    schedule: slot.schedule?.reference,
                    appointmentType: slot.appointmentType?.coding?.[0]?.display,
                    operatingHours: slot.operatingHours
                };
            });
        }
        catch (error) {
            console.error('Failed to get available slots:', error);
            throw new Error('Unable to retrieve appointment availability');
        }
    }
    async getAppointments(startDate, endDate, practitionerId, patientId) {
        try {
            let query = `/Appointment?date=ge${startDate}&date=le${endDate}`;
            if (practitionerId) {
                query += `&practitioner=Practitioner/${practitionerId}`;
            }
            if (patientId) {
                query += `&patient=Patient/${patientId}`;
            }
            const response = await this.makeFHIRRequest(query);
            if (!response.entry) {
                return [];
            }
            return response.entry.map(entry => {
                const appointment = entry.resource;
                return {
                    id: appointment.id,
                    status: appointment.status,
                    appointmentType: appointment.appointmentType,
                    start: appointment.start,
                    end: appointment.end,
                    participant: appointment.participant,
                    description: appointment.description
                };
            });
        }
        catch (error) {
            console.error('Failed to get appointments:', error);
            throw new Error('Unable to retrieve appointments');
        }
    }
    async getPractitioners() {
        try {
            const response = await this.makeFHIRRequest('/Practitioner');
            if (!response.entry) {
                return [];
            }
            return response.entry.map(entry => {
                const practitioner = entry.resource;
                const name = practitioner.name?.[0];
                const displayName = name ?
                    `${name.prefix?.join(' ') || ''} ${name.given?.join(' ') || ''} ${name.family || ''}`.trim() :
                    'Unknown Practitioner';
                return {
                    id: practitioner.id,
                    name: displayName,
                    specialty: practitioner.qualification?.[0]?.code?.coding?.[0]?.display,
                    identifier: practitioner.identifier?.[0]?.value
                };
            });
        }
        catch (error) {
            console.error('Failed to get practitioners:', error);
            throw new Error('Unable to retrieve practitioners');
        }
    }
    async createAppointment(appointmentData) {
        const fhirAppointment = {
            resourceType: 'Appointment',
            status: 'proposed',
            appointmentType: appointmentData.appointmentType ? {
                coding: [{
                        display: appointmentData.appointmentType
                    }]
            } : undefined,
            start: appointmentData.start,
            end: appointmentData.end,
            participant: [
                {
                    actor: {
                        reference: `Patient/${appointmentData.patientId}`
                    },
                    status: 'needs-action'
                },
                {
                    actor: {
                        reference: `Practitioner/${appointmentData.practitionerId}`
                    },
                    status: 'needs-action'
                }
            ],
            description: appointmentData.description
        };
        try {
            const response = await this.makeFHIRRequest('/Appointment', {
                method: 'POST',
                body: JSON.stringify(fhirAppointment)
            });
            return {
                id: response.id,
                status: response.status,
                appointmentType: response.appointmentType,
                start: response.start,
                end: response.end,
                participant: response.participant,
                description: response.description
            };
        }
        catch (error) {
            console.error('Failed to create appointment:', error);
            throw new Error('Unable to create appointment');
        }
    }
    async cancelAppointment(appointmentId, reason) {
        const cancelData = {
            resourceType: 'Appointment',
            id: appointmentId,
            status: 'cancelled',
            cancelationReason: reason ? {
                text: reason
            } : undefined
        };
        try {
            await this.makeFHIRRequest(`/Appointment/${appointmentId}`, {
                method: 'PUT',
                body: JSON.stringify(cancelData)
            });
        }
        catch (error) {
            console.error('Failed to cancel appointment:', error);
            throw new Error('Unable to cancel appointment');
        }
    }
    async testConnection() {
        try {
            await this.ensureValidToken();
            await this.makeFHIRRequest('/metadata');
            return { success: true, message: 'OpenEMR FHIR API connection successful' };
        }
        catch (error) {
            return {
                success: false,
                message: `OpenEMR FHIR API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    async searchAppointments(criteria) {
        try {
            let query = '/Appointment?';
            const params = [];
            if (criteria.confirmationNumber) {
                params.push(`identifier=${criteria.confirmationNumber}`);
            }
            if (criteria.patientId) {
                params.push(`patient=Patient/${criteria.patientId}`);
            }
            if (criteria.startDate) {
                params.push(`date=ge${criteria.startDate}`);
            }
            if (criteria.endDate) {
                params.push(`date=le${criteria.endDate}`);
            }
            query += params.join('&');
            const response = await this.makeFHIRRequest(query);
            if (!response.entry) {
                return [];
            }
            return response.entry.map(entry => this.mapFhirAppointmentToDetails(entry.resource));
        }
        catch (error) {
            console.error('Failed to search appointments:', error);
            throw new Error('Unable to search appointments');
        }
    }
    async searchPatientsByPhone(phoneNumber) {
        try {
            const normalizedPhone = phoneNumber.replace(/\D/g, '');
            const query = `/Patient?telecom=${normalizedPhone}`;
            const response = await this.makeFHIRRequest(query);
            if (!response.entry) {
                return [];
            }
            return response.entry.map(entry => ({
                id: entry.resource.id,
                name: this.formatPatientName(entry.resource.name),
                phoneNumber: this.extractPhoneNumber(entry.resource.telecom),
                dateOfBirth: entry.resource.birthDate
            }));
        }
        catch (error) {
            console.error('Failed to search patients by phone:', error);
            throw new Error('Unable to search patients by phone number');
        }
    }
    async getPatientDetails(patientId) {
        try {
            const response = await this.makeFHIRRequest(`/Patient/${patientId}`);
            return {
                id: response.id,
                firstName: response.name?.[0]?.given?.[0] || '',
                lastName: response.name?.[0]?.family || '',
                dateOfBirth: response.birthDate,
                phoneNumber: this.extractPhoneNumber(response.telecom)
            };
        }
        catch (error) {
            console.error('Failed to get patient details:', error);
            return null;
        }
    }
    async updateAppointment(appointmentId, updateData) {
        try {
            const existing = await this.makeFHIRRequest(`/Appointment/${appointmentId}`);
            const updatedAppointment = {
                ...existing,
                start: updateData.start || existing.start,
                end: updateData.end || existing.end,
                appointmentType: updateData.appointmentType ? {
                    coding: [{ display: updateData.appointmentType }]
                } : existing.appointmentType,
                reason: updateData.reason ? [{
                        text: updateData.reason
                    }] : existing.reason
            };
            if (updateData.practitionerId) {
                const practitionerParticipant = updatedAppointment.participant?.find((p) => p.actor?.reference?.startsWith('Practitioner/'));
                if (practitionerParticipant) {
                    practitionerParticipant.actor.reference = `Practitioner/${updateData.practitionerId}`;
                }
            }
            if (updateData.duration && updateData.start) {
                const startTime = new Date(updateData.start);
                const endTime = new Date(startTime.getTime() + updateData.duration * 60000);
                updatedAppointment.end = endTime.toISOString();
            }
            const response = await this.makeFHIRRequest(`/Appointment/${appointmentId}`, {
                method: 'PUT',
                body: JSON.stringify(updatedAppointment)
            });
            return this.mapFhirAppointmentToDetails(response);
        }
        catch (error) {
            console.error('Failed to update appointment:', error);
            throw new Error('Unable to update appointment');
        }
    }
    async checkSlotAvailability(dateTime, practitionerId, duration) {
        try {
            const startTime = new Date(dateTime);
            const endTime = new Date(startTime.getTime() + duration * 60000);
            const query = `/Appointment?practitioner=Practitioner/${practitionerId}&date=ge${startTime.toISOString()}&date=le${endTime.toISOString()}&status:not=cancelled`;
            const response = await this.makeFHIRRequest(query);
            const conflicts = response.entry?.map(entry => `Existing appointment from ${entry.resource.start} to ${entry.resource.end}`) || [];
            return {
                available: conflicts.length === 0,
                conflicts: conflicts.length > 0 ? conflicts : undefined
            };
        }
        catch (error) {
            console.error('Failed to check slot availability:', error);
            return { available: false, conflicts: ['Unable to verify availability'] };
        }
    }
    mapFhirAppointmentToDetails(fhirAppointment) {
        const practitionerParticipant = fhirAppointment.participant?.find((p) => p.actor?.reference?.startsWith('Practitioner/'));
        const patientParticipant = fhirAppointment.participant?.find((p) => p.actor?.reference?.startsWith('Patient/'));
        return {
            id: fhirAppointment.id,
            patientId: patientParticipant?.actor?.reference?.replace('Patient/', '') || '',
            patientName: patientParticipant?.actor?.display || '',
            practitionerId: practitionerParticipant?.actor?.reference?.replace('Practitioner/', '') || '',
            practitionerName: practitionerParticipant?.actor?.display || '',
            datetime: fhirAppointment.start,
            duration: this.calculateDurationMinutes(fhirAppointment.start, fhirAppointment.end),
            type: fhirAppointment.appointmentType?.coding?.[0]?.display || 'routine',
            status: fhirAppointment.status,
            reason: fhirAppointment.reason?.[0]?.text || fhirAppointment.description,
            confirmationNumber: fhirAppointment.identifier?.[0]?.value || this.generateConfirmationNumber()
        };
    }
    formatPatientName(nameArray) {
        if (!nameArray || nameArray.length === 0)
            return 'Unknown Patient';
        const name = nameArray[0];
        const given = name.given?.join(' ') || '';
        const family = name.family || '';
        return `${given} ${family}`.trim();
    }
    extractPhoneNumber(telecomArray) {
        if (!telecomArray)
            return '';
        const phoneEntry = telecomArray.find(t => t.system === 'phone');
        return phoneEntry?.value || '';
    }
    calculateDurationMinutes(start, end) {
        const startTime = new Date(start);
        const endTime = new Date(end);
        return Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    }
    generateConfirmationNumber() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 6);
        return `CE${timestamp}${random}`.toUpperCase();
    }
    async logout() {
        if (this.accessToken) {
            try {
                await fetch(`${this.config.baseUrl}/oauth2/${this.config.site}/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                });
            }
            catch (error) {
                console.warn('Logout request failed:', error);
            }
        }
        this.accessToken = undefined;
        this.refreshToken = undefined;
        this.tokenExpiry = undefined;
    }
}
exports.OpenEMRSchedulingClient = OpenEMRSchedulingClient;
//# sourceMappingURL=openemr-client.js.map