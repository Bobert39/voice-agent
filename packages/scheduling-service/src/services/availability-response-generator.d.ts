import { TimeSlot } from './availability-service';
interface ResponseOptions {
    includeProvider?: boolean;
    includeInstructions?: boolean;
    confirmationStyle?: 'simple' | 'detailed';
    maxOptions?: number;
}
export declare class AvailabilityResponseGenerator {
    generateAvailabilityResponse(slots: TimeSlot[], queryContext: string, options?: ResponseOptions): string;
    private generateOpeningPhrase;
    private formatSlotOption;
    private generateInstructions;
    private generateNoAvailabilityResponse;
    generateBookingConfirmation(slot: TimeSlot, patientName: string): string;
    generateClarificationResponse(context: string): string;
    generateSameDayOptions(slots: TimeSlot[]): string;
    generateHumanHandoffMessage(): string;
}
export {};
//# sourceMappingURL=availability-response-generator.d.ts.map