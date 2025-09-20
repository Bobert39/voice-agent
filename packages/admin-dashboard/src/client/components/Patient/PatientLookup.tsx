/**
 * Patient Lookup and Interaction History Interface
 */

import React, { useState } from 'react';
import { PatientSearchParams, AppointmentOverride } from '../../types/dashboard';

interface PatientInteraction {
  id: string;
  type: 'call' | 'appointment' | 'inquiry';
  date: Date;
  duration?: number;
  outcome: string;
  summary: string;
  staffMember?: string;
  escalated: boolean;
}

interface Patient {
  mrn: string;
  name: string;
  phone: string;
  email: string;
  lastVisit?: Date;
  nextAppointment?: Date;
  interactions: PatientInteraction[];
}

export const PatientLookup: React.FC = () => {
  const [searchParams, setSearchParams] = useState<PatientSearchParams>({});
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);

  // Mock patient data
  const mockPatients: Patient[] = [
    {
      mrn: '12345',
      name: 'John Smith',
      phone: '(555) 123-4567',
      email: 'john.smith@email.com',
      lastVisit: new Date('2024-12-15'),
      nextAppointment: new Date('2025-02-15'),
      interactions: [
        {
          id: 'int-001',
          type: 'call',
          date: new Date('2025-01-19T10:30:00'),
          duration: 185,
          outcome: 'appointment_scheduled',
          summary: 'Patient called to schedule routine eye exam. AI successfully scheduled appointment for February 15th.',
          escalated: false
        },
        {
          id: 'int-002',
          type: 'appointment',
          date: new Date('2024-12-15T14:00:00'),
          outcome: 'completed',
          summary: 'Routine eye exam completed. No vision changes, prescription updated.',
          staffMember: 'Dr. Wilson',
          escalated: false
        }
      ]
    },
    {
      mrn: '67890',
      name: 'Mary Johnson',
      phone: '(555) 987-6543',
      email: 'mary.j@email.com',
      lastVisit: new Date('2024-11-20'),
      interactions: [
        {
          id: 'int-003',
          type: 'call',
          date: new Date('2025-01-19T11:15:00'),
          duration: 240,
          outcome: 'escalated',
          summary: 'Patient reported sudden vision changes. AI escalated to staff for immediate attention.',
          staffMember: 'Sarah Chen (Receptionist)',
          escalated: true
        }
      ]
    }
  ];

  const handleSearch = async () => {
    if (!searchParams.query && !searchParams.dateRange) return;

    setIsSearching(true);

    // Simulate search delay
    setTimeout(() => {
      const results = mockPatients.filter(patient => {
        if (searchParams.query) {
          const query = searchParams.query.toLowerCase();
          return (
            patient.name.toLowerCase().includes(query) ||
            patient.mrn.includes(query) ||
            patient.phone.includes(query)
          );
        }
        return true;
      });

      setSearchResults(results);
      setIsSearching(false);
    }, 500);
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getInteractionIcon = (type: string): string => {
    switch (type) {
      case 'call': return '📞';
      case 'appointment': return '📅';
      case 'inquiry': return '💬';
      default: return '📄';
    }
  };

  const getOutcomeClass = (outcome: string): string => {
    switch (outcome) {
      case 'completed': return 'outcome-success';
      case 'escalated': return 'outcome-warning';
      case 'appointment_scheduled': return 'outcome-success';
      case 'cancelled': return 'outcome-danger';
      default: return 'outcome-neutral';
    }
  };

  return (
    <div className="patient-lookup">
      <div className="lookup-header">
        <h2>Patient Lookup</h2>
      </div>

      {/* Search Interface */}
      <div className="search-interface widget">
        <h3>Search Patients</h3>
        <div className="search-form">
          <div className="form-row">
            <div className="form-group">
              <label>Name, MRN, or Phone:</label>
              <input
                type="text"
                placeholder="Enter patient name, MRN, or phone number..."
                value={searchParams.query || ''}
                onChange={(e) => setSearchParams({ ...searchParams, query: e.target.value })}
                className="search-input"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || (!searchParams.query && !searchParams.dateRange)}
              className="search-btn"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Interaction Type:</label>
              <select
                value={searchParams.interactionType || ''}
                onChange={(e) => setSearchParams({
                  ...searchParams,
                  interactionType: e.target.value as any || undefined
                })}
              >
                <option value="">All Types</option>
                <option value="call">Calls</option>
                <option value="appointment">Appointments</option>
                <option value="inquiry">Inquiries</option>
              </select>
            </div>
            <div className="form-group">
              <label>Status:</label>
              <select
                value={searchParams.status || ''}
                onChange={(e) => setSearchParams({
                  ...searchParams,
                  status: e.target.value as any || undefined
                })}
              >
                <option value="">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="escalated">Escalated</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="lookup-content">
        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="search-results widget">
            <h3>Search Results ({searchResults.length})</h3>
            <div className="patient-list">
              {searchResults.map((patient) => (
                <div
                  key={patient.mrn}
                  className={`patient-item ${selectedPatient?.mrn === patient.mrn ? 'selected' : ''}`}
                  onClick={() => handleSelectPatient(patient)}
                >
                  <div className="patient-header">
                    <span className="patient-name">{patient.name}</span>
                    <span className="patient-mrn">MRN: {patient.mrn}</span>
                  </div>
                  <div className="patient-details">
                    <span className="patient-phone">{patient.phone}</span>
                    <span className="interaction-count">
                      {patient.interactions.length} interactions
                    </span>
                    {patient.lastVisit && (
                      <span className="last-visit">
                        Last visit: {patient.lastVisit.toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Patient Details */}
        {selectedPatient && (
          <div className="patient-details-panel">
            {/* Patient Info */}
            <div className="patient-info widget">
              <h3>Patient Information</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Name:</label>
                  <span>{selectedPatient.name}</span>
                </div>
                <div className="info-item">
                  <label>MRN:</label>
                  <span>{selectedPatient.mrn}</span>
                </div>
                <div className="info-item">
                  <label>Phone:</label>
                  <span>{selectedPatient.phone}</span>
                </div>
                <div className="info-item">
                  <label>Email:</label>
                  <span>{selectedPatient.email}</span>
                </div>
                {selectedPatient.lastVisit && (
                  <div className="info-item">
                    <label>Last Visit:</label>
                    <span>{selectedPatient.lastVisit.toLocaleDateString()}</span>
                  </div>
                )}
                {selectedPatient.nextAppointment && (
                  <div className="info-item">
                    <label>Next Appointment:</label>
                    <span>{selectedPatient.nextAppointment.toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {selectedPatient.nextAppointment && (
                <div className="appointment-actions">
                  <button
                    onClick={() => setShowOverrideModal(true)}
                    className="btn-override"
                  >
                    Modify Appointment
                  </button>
                </div>
              )}
            </div>

            {/* Interaction History */}
            <div className="interaction-history widget">
              <h3>Interaction History</h3>
              <div className="timeline">
                {selectedPatient.interactions
                  .sort((a, b) => b.date.getTime() - a.date.getTime())
                  .map((interaction) => (
                    <div key={interaction.id} className="timeline-item">
                      <div className="timeline-marker">
                        <span className="interaction-icon">
                          {getInteractionIcon(interaction.type)}
                        </span>
                      </div>
                      <div className="timeline-content">
                        <div className="interaction-header">
                          <span className="interaction-type">
                            {interaction.type.charAt(0).toUpperCase() + interaction.type.slice(1)}
                          </span>
                          <span className="interaction-date">
                            {interaction.date.toLocaleDateString()} {interaction.date.toLocaleTimeString()}
                          </span>
                          {interaction.duration && (
                            <span className="interaction-duration">
                              Duration: {formatDuration(interaction.duration)}
                            </span>
                          )}
                        </div>
                        <div className={`interaction-outcome ${getOutcomeClass(interaction.outcome)}`}>
                          {interaction.outcome.replace('_', ' ')}
                          {interaction.escalated && <span className="escalation-badge">⚠️ Escalated</span>}
                        </div>
                        <div className="interaction-summary">
                          {interaction.summary}
                        </div>
                        {interaction.staffMember && (
                          <div className="staff-member">
                            Handled by: {interaction.staffMember}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Appointment Override Modal */}
      {showOverrideModal && selectedPatient?.nextAppointment && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Modify Appointment</h3>
            <div className="appointment-override-form">
              <div className="current-appointment">
                <h4>Current Appointment</h4>
                <p>Date: {selectedPatient.nextAppointment.toLocaleDateString()}</p>
                <p>Time: {selectedPatient.nextAppointment.toLocaleTimeString()}</p>
              </div>

              <div className="override-options">
                <button className="btn-modify">Reschedule</button>
                <button className="btn-cancel-appt">Cancel</button>
                <button className="btn-confirm">Confirm</button>
              </div>
            </div>

            <div className="modal-actions">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="btn-close"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};