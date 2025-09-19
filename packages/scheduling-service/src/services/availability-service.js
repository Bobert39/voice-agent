"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AvailabilityService = void 0;
const shared_utils_1 = require("@voice-agent/shared-utils");
class AvailabilityService {
    openemrClient;
    redis;
    businessRules;
    cacheEnabled;
    cacheTTL = 300;
    constructor(openemrClient, redis, businessRules, cacheEnabled = true) {
        this.openemrClient = openemrClient;
        this.redis = redis;
        this.businessRules = businessRules;
        this.cacheEnabled = cacheEnabled;
    }
    async getAvailableSlots(query) {
        const cacheKey = this.generateCacheKey(query);
        if (this.cacheEnabled) {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                shared_utils_1.logger.info('Returning cached availability', { query });
                return JSON.parse(cached);
            }
        }
        try {
            const rawSlots = await this.openemrClient.getAvailableSlots(query.startDate, query.endDate, query.practitionerId, query.appointmentType);
            const practitioners = await this.getPractitioners();
            const practitionerMap = new Map(practitioners.map(p => [p.id, p]));
            const filteredSlots = await this.applyBusinessRules(rawSlots, query, practitionerMap);
            filteredSlots.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
            if (this.cacheEnabled) {
                await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(filteredSlots));
            }
            return filteredSlots;
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to get available slots', { error, query });
            throw error;
        }
    }
    async applyBusinessRules(rawSlots, query, practitionerMap) {
        const filteredSlots = [];
        for (const slot of rawSlots) {
            const slotDate = new Date(slot.start);
            const dayOfWeek = slotDate.toLocaleDateString('en-US', { weekday: 'lowercase' });
            if (this.isHoliday(slotDate)) {
                continue;
            }
            const businessHours = this.businessRules.businessHours[dayOfWeek];
            if (!businessHours) {
                continue;
            }
            const slotTime = slotDate.toTimeString().substring(0, 5);
            if (slotTime < businessHours.open || slotTime >= businessHours.close) {
                continue;
            }
            if (businessHours.lunchStart && businessHours.lunchEnd) {
                if (slotTime >= businessHours.lunchStart && slotTime < businessHours.lunchEnd) {
                    continue;
                }
            }
            if (this.isBlockedTime(dayOfWeek, slotTime)) {
                continue;
            }
            if (query.preferredTimeOfDay && !this.matchesTimePreference(slotTime, query.preferredTimeOfDay)) {
                continue;
            }
            const appointmentType = query.appointmentType || 'routine';
            const duration = this.businessRules.appointmentDurations[appointmentType];
            const slotEndTime = this.addMinutesToTime(slotTime, duration + this.businessRules.bufferTimes.standard);
            if (slotEndTime > businessHours.close) {
                continue;
            }
            const practitionerId = this.extractPractitionerIdFromSchedule(slot.schedule);
            const practitioner = practitionerMap.get(practitionerId);
            filteredSlots.push({
                datetime: slot.start,
                practitioner: practitioner?.name || 'Available Provider',
                practitionerId: practitionerId || '',
                duration,
                appointmentType,
                available: true
            });
        }
        return filteredSlots;
    }
    isHoliday(date) {
        const dateStr = date.toISOString().split('T')[0];
        return this.businessRules.holidays.includes(dateStr);
    }
    isBlockedTime(dayOfWeek, time) {
        return this.businessRules.blockedTimes.some(block => block.dayOfWeek.toLowerCase() === dayOfWeek &&
            time >= block.startTime &&
            time < block.endTime);
    }
    matchesTimePreference(time, preference) {
        const hour = parseInt(time.split(':')[0]);
        switch (preference) {
            case 'morning':
                return hour >= 8 && hour < 12;
            case 'afternoon':
                return hour >= 12 && hour < 17;
            case 'evening':
                return hour >= 17 && hour < 20;
            default:
                return true;
        }
    }
    addMinutesToTime(time, minutes) {
        const [hours, mins] = time.split(':').map(Number);
        const totalMinutes = hours * 60 + mins + minutes;
        const newHours = Math.floor(totalMinutes / 60);
        const newMins = totalMinutes % 60;
        return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
    }
    extractPractitionerIdFromSchedule(schedule) {
        if (!schedule)
            return '';
        const match = schedule.match(/Schedule\/(\d+)/);
        return match ? match[1] : '';
    }
    async getPractitioners() {
        const cacheKey = 'practitioners:all';
        if (this.cacheEnabled) {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        }
        const practitioners = await this.openemrClient.getPractitioners();
        if (this.cacheEnabled) {
            await this.redis.setex(cacheKey, 3600, JSON.stringify(practitioners));
        }
        return practitioners;
    }
    generateCacheKey(query) {
        const parts = [
            'availability',
            query.startDate,
            query.endDate,
            query.appointmentType || 'any',
            query.practitionerId || 'any',
            query.preferredTimeOfDay || 'any'
        ];
        return parts.join(':');
    }
    async invalidateCache(startDate, endDate) {
        if (!this.cacheEnabled)
            return;
        try {
            if (!startDate) {
                const keys = await this.redis.keys('availability:*');
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                }
            }
            else {
                const pattern = `availability:${startDate}*`;
                const keys = await this.redis.keys(pattern);
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                }
            }
            shared_utils_1.logger.info('Cache invalidated', { startDate, endDate });
        }
        catch (error) {
            shared_utils_1.logger.error('Failed to invalidate cache', { error });
        }
    }
    async getNextAvailableSlots(appointmentType = 'routine', maxSlots = 3, practitionerId) {
        const today = new Date();
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 60);
        const query = {
            startDate: today.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            appointmentType,
            practitionerId
        };
        const allSlots = await this.getAvailableSlots(query);
        return allSlots.slice(0, maxSlots);
    }
    parseNaturalDate(reference) {
        const today = new Date();
        const normalizedRef = reference.toLowerCase().trim();
        if (normalizedRef.includes('tomorrow')) {
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateStr = tomorrow.toISOString().split('T')[0];
            return { startDate: dateStr, endDate: dateStr };
        }
        if (normalizedRef.includes('next week')) {
            const nextWeek = new Date(today);
            nextWeek.setDate(nextWeek.getDate() + 7);
            const endOfWeek = new Date(nextWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 6);
            return {
                startDate: nextWeek.toISOString().split('T')[0],
                endDate: endOfWeek.toISOString().split('T')[0]
            };
        }
        if (normalizedRef.includes('this week')) {
            const endOfWeek = new Date(today);
            endOfWeek.setDate(endOfWeek.getDate() + (6 - today.getDay()));
            return {
                startDate: today.toISOString().split('T')[0],
                endDate: endOfWeek.toISOString().split('T')[0]
            };
        }
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        for (let i = 0; i < days.length; i++) {
            if (normalizedRef.includes(days[i])) {
                const targetDay = i;
                const currentDay = today.getDay();
                let daysToAdd = targetDay - currentDay;
                if (daysToAdd <= 0) {
                    daysToAdd += 7;
                }
                const targetDate = new Date(today);
                targetDate.setDate(targetDate.getDate() + daysToAdd);
                const dateStr = targetDate.toISOString().split('T')[0];
                return { startDate: dateStr, endDate: dateStr };
            }
        }
        if (normalizedRef.includes('morning') || normalizedRef.includes('afternoon') || normalizedRef.includes('evening')) {
            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 7);
            return {
                startDate: today.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
            };
        }
        return null;
    }
}
exports.AvailabilityService = AvailabilityService;
//# sourceMappingURL=availability-service.js.map