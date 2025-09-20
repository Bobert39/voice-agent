/**
 * Conversation Replay Interface
 * Audio player with synchronized transcript display
 */

import React, { useState, useRef, useEffect } from 'react';
import { TranscriptEntry } from '../../types/dashboard';

interface ConversationReplayProps {}

export const ConversationReplay: React.FC<ConversationReplayProps> = () => {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  const audioRef = useRef<HTMLAudioElement>(null);

  // Mock conversation data
  const conversations = [
    {
      id: 'conv-001',
      patientName: 'John Smith',
      patientMRN: '12345',
      date: new Date('2025-01-19T10:30:00'),
      duration: 185, // seconds
      outcome: 'appointment_scheduled',
      audioUrl: '/api/audio/conv-001.mp3',
      transcriptEntries: [
        {
          timestamp: new Date('2025-01-19T10:30:00'),
          speaker: 'AI' as const,
          text: 'Hello, this is the AI assistant for Capitol Eye Care. How can I help you today?',
          confidence: 0.95,
          sentiment: 'neutral' as const,
          intent: 'greeting'
        },
        {
          timestamp: new Date('2025-01-19T10:30:15'),
          speaker: 'PATIENT' as const,
          text: 'Hi, I need to schedule an appointment for an eye exam.',
          confidence: 0.88,
          sentiment: 'neutral' as const,
          intent: 'schedule_appointment'
        },
        {
          timestamp: new Date('2025-01-19T10:30:25'),
          speaker: 'AI' as const,
          text: 'I can help you schedule an appointment. Can you please provide your date of birth for verification?',
          confidence: 0.92,
          sentiment: 'neutral' as const,
          intent: 'verification_request'
        }
      ] as TranscriptEntry[]
    },
    {
      id: 'conv-002',
      patientName: 'Mary Johnson',
      patientMRN: '67890',
      date: new Date('2025-01-19T11:15:00'),
      duration: 240,
      outcome: 'escalated',
      audioUrl: '/api/audio/conv-002.mp3',
      transcriptEntries: [
        {
          timestamp: new Date('2025-01-19T11:15:00'),
          speaker: 'AI' as const,
          text: 'Hello, this is the AI assistant for Capitol Eye Care. How can I help you today?',
          confidence: 0.95,
          sentiment: 'neutral' as const,
          intent: 'greeting'
        },
        {
          timestamp: new Date('2025-01-19T11:15:12'),
          speaker: 'PATIENT' as const,
          text: 'I\'m having trouble seeing clearly and I\'m worried something is wrong.',
          confidence: 0.82,
          sentiment: 'negative' as const,
          intent: 'medical_concern'
        }
      ] as TranscriptEntry[]
    }
  ];

  const filteredConversations = conversations.filter(conv =>
    conv.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.patientMRN.includes(searchQuery)
  );

  const selectedConv = conversations.find(c => c.id === selectedConversation);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', () => setIsPlaying(false));

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', () => setIsPlaying(false));
    };
  }, [selectedConversation]);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = time;
    setCurrentTime(time);
  };

  const handleSpeedChange = (speed: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.playbackRate = speed;
    setPlaybackSpeed(speed);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSentimentIcon = (sentiment: string): string => {
    switch (sentiment) {
      case 'positive': return '😊';
      case 'negative': return '😟';
      default: return '😐';
    }
  };

  return (
    <div className="conversation-replay">
      <div className="replay-header">
        <h2>Conversation Replay</h2>
        <div className="search-controls">
          <input
            type="text"
            placeholder="Search by patient name or MRN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="replay-content">
        {/* Conversation List */}
        <div className="conversation-list">
          <h3>Recent Conversations</h3>
          {filteredConversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`conversation-item ${selectedConversation === conversation.id ? 'selected' : ''}`}
              onClick={() => setSelectedConversation(conversation.id)}
            >
              <div className="conv-header">
                <span className="patient-name">{conversation.patientName}</span>
                <span className="conv-date">
                  {conversation.date.toLocaleDateString()} {conversation.date.toLocaleTimeString()}
                </span>
              </div>
              <div className="conv-details">
                <span className="mrn">MRN: {conversation.patientMRN}</span>
                <span className="duration">{formatTime(conversation.duration)}</span>
                <span className={`outcome outcome-${conversation.outcome}`}>
                  {conversation.outcome.replace('_', ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Audio Player and Transcript */}
        {selectedConv && (
          <div className="replay-player">
            <div className="player-header">
              <h3>
                {selectedConv.patientName} - {selectedConv.date.toLocaleDateString()}
              </h3>
              <span className="patient-mrn">MRN: {selectedConv.patientMRN}</span>
            </div>

            {/* Audio Controls */}
            <div className="audio-controls">
              <audio
                ref={audioRef}
                src={selectedConv.audioUrl}
                preload="metadata"
              />

              <div className="playback-controls">
                <button
                  className="play-pause-btn"
                  onClick={handlePlayPause}
                >
                  {isPlaying ? '⏸️' : '▶️'}
                </button>

                <div className="time-display">
                  <span>{formatTime(currentTime)}</span>
                  <span>/</span>
                  <span>{formatTime(duration)}</span>
                </div>

                <div className="speed-controls">
                  <label>Speed:</label>
                  <select
                    value={playbackSpeed}
                    onChange={(e) => handleSpeedChange(Number(e.target.value))}
                  >
                    <option value={0.5}>0.5x</option>
                    <option value={0.75}>0.75x</option>
                    <option value={1}>1x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2x</option>
                  </select>
                </div>
              </div>

              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                ></div>
                <input
                  type="range"
                  min="0"
                  max={duration}
                  value={currentTime}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  className="progress-slider"
                />
              </div>
            </div>

            {/* Transcript Viewer */}
            <div className="transcript-viewer">
              <h4>Conversation Transcript</h4>
              <div className="transcript-entries">
                {selectedConv.transcriptEntries.map((entry, index) => {
                  const entryTime = (entry.timestamp.getTime() - selectedConv.date.getTime()) / 1000;
                  const isActive = Math.abs(currentTime - entryTime) < 2;

                  return (
                    <div
                      key={index}
                      className={`transcript-entry ${entry.speaker.toLowerCase()} ${isActive ? 'active' : ''}`}
                      onClick={() => handleSeek(entryTime)}
                    >
                      <div className="entry-header">
                        <span className="speaker">{entry.speaker}:</span>
                        <span className="timestamp">{formatTime(entryTime)}</span>
                        <span className="sentiment">{getSentimentIcon(entry.sentiment)}</span>
                        <span className="confidence">{Math.round(entry.confidence * 100)}%</span>
                      </div>
                      <div className="entry-text">{entry.text}</div>
                      {entry.intent && (
                        <div className="entry-intent">Intent: {entry.intent}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quality Review Tools */}
            <div className="quality-review">
              <h4>Quality Review</h4>
              <div className="review-controls">
                <button className="btn-flag">🚩 Flag for Training</button>
                <button className="btn-note">📝 Add Note</button>
                <div className="rating-controls">
                  <label>AI Performance:</label>
                  <div className="star-rating">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} className="star">⭐</button>
                    ))}
                  </div>
                </div>
                <button className="btn-export">📄 Export</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};