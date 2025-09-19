interface OpenEMRConfig {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    scope: string;
    site?: string;
}
interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in: number;
    id_token?: string;
}
export interface Practitioner {
    id: string;
    name: string;
    specialty?: string;
    identifier?: string;
}
export interface AppointmentSlot {
    id: string;
    start: string;
    end: string;
    status: 'busy' | 'free' | 'busy-unavailable' | 'busy-tentative' | 'entered-in-error';
    schedule?: string;
    appointmentType?: string;
    operatingHours?: {
        daysOfWeek?: string[];
        allDay?: boolean;
        openingTime?: string;
        closingTime?: string;
    };
}
export interface Appointment {
    id: string;
    status: 'proposed' | 'pending' | 'booked' | 'arrived' | 'fulfilled' | 'cancelled' | 'noshow';
    appointmentType?: {
        coding: Array<{
            system?: string;
            code?: string;
            display?: string;
        }>;
    };
    start: string;
    end: string;
    participant?: Array<{
        actor?: {
            reference?: string;
            display?: string;
        };
        status: 'accepted' | 'declined' | 'tentative' | 'needs-action';
    }>;
    description?: string;
}
export declare class OpenEMRSchedulingClient {
    private config;
    private accessToken?;
    private refreshToken?;
    private tokenExpiry?;
    constructor(config: OpenEMRConfig);
    authenticateWithClientCredentials(): Promise<TokenResponse>;
    refreshAccessToken(): Promise<TokenResponse>;
    getAvailableSlotsEnhanced(startDate: string, endDate: string, practitionerId?: string, appointmentType?: string, includeMetadata?: boolean): Promise<AppointmentSlot[]>;
    getPractitionerCalendar(practitionerId: string, startDate: Date, days?: number): Promise<Map<string, AppointmentSlot[]>>;
    getBatchPractitionerSlots(practitionerIds: string[], startDate: string, endDate: string): Promise<Map<string, AppointmentSlot[]>>;
    private mapToAppointmentSlot;
    private setTokens;
    private ensureValidToken;
    private makeFHIRRequest;
    getAvailableSlots(startDate: string, endDate: string, practitionerId?: string, appointmentType?: string): Promise<AppointmentSlot[]>;
    getAppointments(startDate: string, endDate: string, practitionerId?: string, patientId?: string): Promise<Appointment[]>;
    getPractitioners(): Promise<Practitioner[]>;
    createAppointment(appointmentData: {
        start: string;
        end: string;
        patientId: string;
        practitionerId: string;
        appointmentType?: string;
        description?: string;
    }): Promise<Appointment>;
    cancelAppointment(appointmentId: string, reason?: string): Promise<void>;
    testConnection(): Promise<{
        success: boolean;
        message: string;
    }>;
    searchAppointments(criteria: {
        confirmationNumber?: string;
        patientId?: string;
        startDate?: string;
        endDate?: string;
    }): Promise<any[]>;
    searchPatientsByPhone(phoneNumber: string): Promise<any[]>;
    getPatientDetails(patientId: string): Promise<any | null>;
    updateAppointment(appointmentId: string, updateData: {
        start?: string;
        end?: string;
        practitionerId?: string;
        appointmentType?: string;
        duration?: number;
        reason?: string;
    }): Promise<any>;
    private mapFhirAppointmentToDetails;
    private formatPatientName;
    private extractPhoneNumber;
    private calculateDurationMinutes;
    private generateConfirmationNumber;
    logout(): Promise<void>;
}
export {};
//# sourceMappingURL=openemr-client.d.ts.map