# Conversation Context Management and Error Recovery Specification

## Executive Summary

This specification defines the comprehensive conversation context management system for the Capitol Eye Care AI Voice Agent, including session persistence, context carryover, error recovery patterns, and graceful degradation strategies. The system leverages Redis for distributed session storage with intelligent TTL management and implements multi-layer error recovery mechanisms.

## 1. Session Management Architecture

### 1.1 Core Session Properties

#### Session Timeout Configuration
- **Inactive Session Timeout**: 15 minutes (900 seconds)
- **Maximum Session Duration**: 30 minutes (1800 seconds)  
- **Grace Period**: 2 minutes (120 seconds) after timeout warnings
- **Warning Thresholds**: [20 minutes, 25 minutes] - progressive warnings
- **Session Extension**: 10 minutes maximum per extension request

#### Session State Structure
```typescript
interface VoiceSessionState {
  // Core identifiers
  sessionId: string;
  conversationId: string;
  phoneNumber: string;
  patientId?: string;
  patientName?: string;
  
  // Temporal management
  startTime: Date;
  lastActivity: Date;
  totalDuration: number;
  expectedEndTime?: Date;
  warningsSent: number[];
  
  // Context preservation
  conversationTurns: ConversationTurn[];
  contextualMemory: ContextualMemory;
  currentIntent?: string;
  intentHistory: string[];
  
  // Error recovery state
  errorCount: number;
  lastError?: ErrorContext;
  recoveryAttempts: number;
  fallbackMode: boolean;
  
  // Quality metrics
  misunderstandingCount: number;
  clarificationRequests: number;
  verificationAttempts: number;
  emotionalState?: EmotionalState;
}
```

### 1.2 Redis-Based Persistence Strategy

#### Storage Architecture
- **Primary Key Pattern**: `voice-agent:session:{sessionId}`
- **Backup Key Pattern**: `voice-agent:session:backup:{sessionId}`
- **Analytics Key Pattern**: `voice-agent:analytics:{sessionId}`
- **Error Log Pattern**: `voice-agent:errors:{sessionId}`

#### TTL Management Strategy
```typescript
interface TTLConfiguration {
  activeSession: 1800; // 30 minutes
  inactiveSession: 900; // 15 minutes  
  warningThreshold: 600; // 10 minutes remaining
  gracePeriod: 120; // 2 minutes
  backupRetention: 86400; // 24 hours
  analyticsRetention: 2592000; // 30 days
}
```

#### Data Persistence Layers
1. **Active Session Layer**: Hot storage for ongoing conversations
2. **Backup Layer**: Point-in-time snapshots every 5 minutes
3. **Analytics Layer**: Aggregated metrics and performance data
4. **Error Recovery Layer**: Error context and recovery state

## 2. Context Carryover System

### 2.1 Multi-Layer Context Memory

#### Short-Term Context (Current Turn)
- Last 3 conversation turns
- Current topic and entities
- Immediate user intent
- Response confidence scores

#### Medium-Term Context (Session Scope)
- Complete conversation transcript
- Topic progression history
- Patient goals and progress
- Verification status and attempts

#### Long-Term Context (Patient History)
- Previous interaction summaries
- Known patient preferences
- Communication patterns
- Historical appointment data

### 2.2 Reference Resolution Engine

#### Pronoun and Entity Resolution
```typescript
interface ReferenceResolver {
  // Pronoun tracking (it, that, this, they, etc.)
  resolvePronouns(text: string, context: ContextualMemory): ResolvedReferences;
  
  // Topic continuation ("like I mentioned", "what we discussed")
  resolvePreviousTopics(text: string, history: ConversationTurn[]): TopicReferences;
  
  // Entity tracking (doctor names, appointment types, dates)
  trackMentionedEntities(turn: ConversationTurn): ConversationEntity[];
  
  // Context enrichment for follow-up questions
  enrichWithContext(currentTurn: string, memory: ContextualMemory): EnrichedTurn;
}
```

#### Context Enrichment Patterns
- **Temporal References**: "earlier", "before", "yesterday", "next week"
- **Entity References**: "that doctor", "the same time", "my usual appointment"
- **Topic References**: "about what we discussed", "regarding my request"
- **Procedural References**: "like last time", "the process you mentioned"

### 2.3 Conversation Memory Generation

#### Turn-by-Turn Memory Updates
```typescript
interface MemoryUpdateStrategy {
  // Extract key information from each turn
  extractKeyInformation(turn: ConversationTurn): KeyInformation;
  
  // Update topic tracking
  updateTopicProgression(topics: string[], memory: ContextualMemory): void;
  
  // Track patient goals and completion
  trackGoalProgression(turn: ConversationTurn, goals: string[]): GoalUpdate;
  
  // Generate conversation summaries
  generateTurnSummary(recentTurns: ConversationTurn[]): string;
}
```

#### Handoff Summary Generation
- **Patient Context**: Name, phone, verification status
- **Conversation Summary**: Key topics, duration, progress
- **Current State**: Active intent, pending actions, emotional state  
- **Action Items**: Next steps, follow-up requirements
- **Escalation Flags**: Issues requiring staff attention

## 3. Error Recovery Framework

### 3.1 Voice Recognition Failure Recovery

#### Error Classification
```typescript
enum VoiceErrorType {
  NO_AUDIO_DETECTED = 'no_audio_detected',
  UNCLEAR_SPEECH = 'unclear_speech', 
  BACKGROUND_NOISE = 'background_noise',
  VOLUME_TOO_LOW = 'volume_too_low',
  TECHNICAL_FAILURE = 'technical_failure',
  TIMEOUT = 'timeout',
  LANGUAGE_MISMATCH = 'language_mismatch'
}
```

#### Recovery Strategies by Error Type
1. **No Audio Detected**
   - Response: "I'm having trouble hearing you. Could you please speak into the phone?"
   - Retry attempts: 3
   - Escalation: Human handoff after 3 failures

2. **Unclear Speech**
   - Response: "I didn't catch that clearly. Could you please repeat that a bit more slowly?"
   - Additional: "If you're in a noisy area, you might want to move to a quieter location."
   - Retry attempts: 2 per turn

3. **Background Noise**
   - Response: "I'm hearing some background noise. Could you find a quieter place to talk?"
   - Adaptive: Increase voice recognition sensitivity
   - Fallback: Ask for spelling of key information

4. **Volume Too Low**
   - Response: "I'm having trouble hearing you clearly. Could you speak a little louder?"
   - Technical: Adjust input gain if possible
   - Backup: Switch to DTMF input for critical information

5. **Technical Failure**
   - Response: "I'm experiencing a technical issue. Let me try to reconnect."
   - Action: Automatic retry with exponential backoff
   - Escalation: Immediate human handoff if critical

### 3.2 Network Failure Recovery

#### Connection Monitoring
```typescript
interface NetworkMonitoring {
  // Connection health checks
  pingInterval: 30000; // 30 seconds
  timeoutThreshold: 5000; // 5 seconds
  maxRetries: 3;
  
  // Quality metrics
  latencyThreshold: 200; // ms
  jitterThreshold: 50; // ms
  packetLossThreshold: 0.05; // 5%
}
```

#### Fallback Mechanisms
1. **Connection Degradation**
   - Reduce audio quality automatically
   - Implement message queuing for reliability
   - Switch to text-based interaction if available

2. **Complete Connection Loss**
   - Preserve session state in Redis
   - Attempt automatic reconnection
   - Callback system with conversation resumption

3. **Service Unavailability**
   - Graceful degradation to basic functionality
   - Pre-recorded message delivery
   - Queue patient information for later processing

### 3.3 Context Recovery After Interruption

#### Session Restoration Process
```typescript
interface SessionRestoration {
  // Detect returning caller
  identifyReturningCaller(phoneNumber: string): Promise<SessionMatch[]>;
  
  // Restore conversation context
  restoreConversationState(sessionId: string): Promise<ConversationState>;
  
  // Generate reconnection summary
  createReconnectionSummary(state: ConversationState): string;
  
  // Resume conversation flow
  determineResumePoint(state: ConversationState): ConversationPhase;
}
```

#### Reconnection Scenarios
1. **Same Call Session** (within 5 minutes)
   - Full context restoration
   - "I'm back! Let me continue where we left off..."
   - Resume exact conversation state

2. **Recent Disconnect** (5-30 minutes)
   - Context summary provided
   - "I see we were discussing your appointment. Let me quickly recap..."
   - Verify intent before continuing

3. **Delayed Return** (30+ minutes)
   - New session with historical context
   - "I have a record of our earlier conversation. Would you like to continue..."
   - Patient choice to resume or restart

## 4. Graceful Degradation Strategies

### 4.1 Service Degradation Levels

#### Level 0: Full Functionality
- All AI services operational
- Real-time conversation analysis
- Complete context management
- Advanced error recovery

#### Level 1: Reduced AI Features
- Basic conversation handling
- Simplified intent recognition
- Limited context carryover
- Standard error messages

#### Level 2: Essential Services Only
- Practice information delivery
- Basic appointment scheduling
- Emergency escalation
- Recorded message fallbacks

#### Level 3: Emergency Mode
- Contact information only
- Immediate human handoff
- Emergency contact routing
- System status announcements

### 4.2 Adaptive Response Strategies

#### Elderly-Specific Accommodations
```typescript
interface ElderlyAdaptations {
  // Speech patterns
  speechRate: 'slower'; // 150-170 WPM vs 180-200 WPM
  pauseDuration: 1000; // 1 second between sentences
  confirmationFrequency: 'high'; // Repeat important information
  
  // Error handling
  patienceLevel: 'high'; // Extended timeout periods
  clarificationStyle: 'gentle'; // Non-technical language
  repetitionTolerance: 'unlimited'; // No limits on repetition requests
  
  // Conversation flow
  topicPacing: 'slow'; // One topic at a time
  choicePresentation: 'simple'; // Limit options to 2-3
  instructionStyle: 'step-by-step'; // Break down complex tasks
}
```

#### Hearing Impairment Support
- **Volume Amplification**: Automatic gain adjustment
- **Frequency Optimization**: Focus on speech-critical frequencies (300-3400 Hz)
- **Hearing Aid Compatibility**: T-coil support and reduced feedback
- **Backup Communication**: Offer callback or text-based alternatives

### 4.3 Progressive Error Recovery

#### Escalation Ladder
1. **Self-Correction** (Attempt 1)
   - Immediate retry with same approach
   - Slightly modified phrasing

2. **Adaptive Response** (Attempt 2)
   - Change communication style
   - Simplify language or slow down

3. **Alternative Approach** (Attempt 3)
   - Different interaction method
   - Spelling out critical information

4. **Human Preparation** (Attempt 4)
   - Gather context for handoff
   - Explain upcoming transfer

5. **Human Escalation** (Final)
   - Transfer with complete context
   - Continue monitoring for learning

## 5. Implementation Specifications

### 5.1 Redis Configuration

#### Connection Settings
```typescript
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  
  // Connection pooling
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  maxRetriesPerRequest: null,
  
  // Session-specific settings
  keyPrefix: 'voice-agent:',
  family: 4, // IPv4
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
};
```

#### Data Structure Optimization
- **Compression**: Use gzip for large conversation objects
- **Indexing**: Secondary indices for phone number and patient ID lookup
- **Partitioning**: Separate active and archived sessions
- **Monitoring**: Real-time performance metrics

### 5.2 Error Monitoring and Alerting

#### Error Tracking Metrics
```typescript
interface ErrorMetrics {
  // Voice recognition errors
  recognitionFailureRate: number;
  avgRecognitionConfidence: number;
  noiseDetectionCount: number;
  
  // Network errors
  connectionDropRate: number;
  avgLatency: number;
  timeoutCount: number;
  
  // Context errors
  contextLossIncidents: number;
  sessionRestorationFailures: number;
  
  // Patient experience impact
  escalationDueToErrors: number;
  patientFrustrationIndicators: number;
}
```

#### Alert Thresholds
- **Critical**: Error rate > 10% in 5-minute window
- **High**: Context loss > 2 incidents per hour
- **Medium**: Average confidence < 80% over 30 minutes
- **Low**: Escalation rate > 20% due to technical issues

### 5.3 Performance Optimization

#### Caching Strategy
- **Hot Cache**: Most recent 100 active sessions
- **Warm Cache**: Recent 1000 session summaries
- **Cold Storage**: Historical data in compressed format
- **Cache Invalidation**: LRU with TTL-based expiration

#### Load Balancing
- **Session Affinity**: Stick to same Redis instance per session
- **Failover Strategy**: Automatic failover with context preservation
- **Read Replicas**: Scale read operations for analytics
- **Write Optimization**: Batch updates for non-critical data

## 6. Quality Assurance and Testing

### 6.1 Error Recovery Testing

#### Test Scenarios
1. **Network Interruption Tests**
   - Mid-conversation disconnection
   - Gradual connection degradation
   - Complete service outage

2. **Voice Recognition Failure Tests**
   - Various noise conditions
   - Different accent patterns
   - Volume and clarity variations

3. **Context Preservation Tests**
   - Session restoration after timeouts
   - Multi-turn conversation continuity
   - Patient information persistence

### 6.2 Performance Benchmarks

#### Target Metrics
- **Session Restoration**: < 2 seconds
- **Context Lookup**: < 100ms average
- **Error Recovery**: < 5 seconds to alternative
- **Graceful Degradation**: < 1 second mode switching

#### Load Testing Parameters
- **Concurrent Sessions**: 100 active conversations
- **Session Duration**: 15 minutes average
- **Error Injection Rate**: 5% artificial error rate
- **Recovery Success Rate**: > 95% automatic recovery

### 6.3 Monitoring and Analytics

#### Real-Time Dashboards
- Active session count and health
- Error rates by type and impact
- Context preservation success rates
- Patient satisfaction indicators

#### Historical Analysis
- Error pattern trends over time
- Context management effectiveness
- Recovery strategy performance
- Patient experience correlation with technical issues

## 7. Security and Privacy Considerations

### 7.1 Data Protection
- **Encryption**: AES-256 encryption for all session data
- **Access Control**: Role-based Redis access with audit logging
- **Data Retention**: Automatic purging based on compliance requirements
- **PII Handling**: Tokenization of sensitive patient information

### 7.2 HIPAA Compliance
- **Audit Logging**: Complete trail of all session access and modifications
- **Data Minimization**: Store only necessary context information
- **Secure Transmission**: TLS 1.3 for all Redis connections
- **Access Monitoring**: Real-time alerts for unusual access patterns

## 8. Future Enhancements

### 8.1 Advanced Context Management
- **Semantic Understanding**: Deeper meaning extraction from conversations
- **Predictive Context**: Anticipate user needs based on conversation patterns
- **Cross-Session Learning**: Improve context management from aggregate patterns

### 8.2 Enhanced Error Recovery
- **Machine Learning**: Adaptive error recovery based on success patterns
- **Proactive Detection**: Predict and prevent errors before they occur
- **Personalized Recovery**: Tailor recovery strategies to individual patients

This specification provides the foundation for implementing a robust, reliable, and patient-friendly conversation context management system that maintains continuity even in the face of technical challenges while prioritizing the elderly patient experience.