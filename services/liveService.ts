import { GoogleGenAI, FunctionDeclaration, Type, Schema, LiveServerMessage, Modality } from "@google/genai";
import { SolarSystemData, ComponentType } from '../types';

const COMPONENT_TYPE_ENUM = [
  ComponentType.PV_ARRAY,
  ComponentType.DC_COMBINER,
  ComponentType.DC_BREAKER,
  ComponentType.DC_SPD,
  ComponentType.INVERTER,
  ComponentType.AC_BREAKER,
  ComponentType.AC_SPD,
  ComponentType.AC_DISTRIBUTION,
  ComponentType.METER,
  ComponentType.GRID,
  ComponentType.LOAD
];

// Schema for the tool
const updateDesignSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    meta: {
      type: Type.OBJECT,
      properties: {
        projectName: { type: Type.STRING },
        location: { type: Type.STRING },
        totalCapacity: { type: Type.STRING },
        systemVoltage: { type: Type.STRING },
      },
      required: ['projectName', 'location', 'totalCapacity', 'systemVoltage']
    },
    components: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: { type: Type.STRING, enum: COMPONENT_TYPE_ENUM },
          label: { type: Type.STRING },
          specs: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['id', 'type', 'label', 'specs']
      }
    },
    connections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          from: { type: Type.STRING },
          to: { type: Type.STRING },
          label: { type: Type.STRING },
          type: { type: Type.STRING, enum: ['DC', 'AC', 'GROUND'] },
        },
        required: ['from', 'to', 'label', 'type']
      }
    },
    engineerComment: {
      type: Type.STRING,
      description: "A short technical comment explaining the changes in Arabic."
    }
  },
  required: ['meta', 'components', 'connections', 'engineerComment']
};

const updateDesignTool: FunctionDeclaration = {
  name: 'updateSolarDesign',
  description: 'Updates the solar system Single Line Diagram (SLD) and technical specifications based on the discussion.',
  parameters: updateDesignSchema
};

export class LiveService {
  private ai: GoogleGenAI;
  private session: any = null;
  private audioContext: AudioContext | null = null;
  private inputContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nextStartTime = 0;
  private onDesignUpdate: ((data: SolarSystemData, comment: string) => void) | null = null;

  constructor() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key missing");
    this.ai = new GoogleGenAI({ apiKey });
  }

  async connect(
    currentSystem: SolarSystemData, 
    onDesignUpdate: (data: SolarSystemData, comment: string) => void,
    onStatusChange: (status: string) => void
  ) {
    this.onDesignUpdate = onDesignUpdate;
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      onStatusChange('connected');
      
      const sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are an expert Solar Energy Engineer discussing a project with a colleague. 
          Speak in Arabic (Saudi dialect preferred). Be professional but conversational.
          You have access to a CAD tool via 'updateSolarDesign'. 
          If the user asks to change the design, call the function immediately.
          IMPORTANT: Use IEC standards. Include protection devices (DC_BREAKER, AC_BREAKER, DC_SPD, AC_SPD) in your design updates.
          Current Design Context: ${JSON.stringify(currentSystem.meta)}`,
          tools: [{ functionDeclarations: [updateDesignTool] }],
        },
        callbacks: {
          onopen: () => {
             console.log("Live Session Open");
             this.startAudioInput(sessionPromise);
          },
          onmessage: async (msg: LiveServerMessage) => {
             this.handleMessage(msg, sessionPromise);
          },
          onclose: () => {
             console.log("Live Session Closed");
             onStatusChange('disconnected');
          },
          onerror: (err) => {
             console.error("Live Session Error", err);
             onStatusChange('error');
          }
        }
      });
      
      this.session = await sessionPromise;

    } catch (e) {
      console.error(e);
      onStatusChange('error');
    }
  }

  private startAudioInput(sessionPromise: Promise<any>) {
    if (!this.inputContext || !this.stream) return;

    this.source = this.inputContext.createMediaStreamSource(this.stream);
    this.processor = this.inputContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const b64 = this.pcmToB64(inputData);
      
      sessionPromise.then(session => {
         session.sendRealtimeInput({
            mimeType: 'audio/pcm;rate=16000',
            data: b64
         });
      });
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputContext.destination);
  }

  private async handleMessage(msg: LiveServerMessage, sessionPromise: Promise<any>) {
    // Handle Audio
    const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData) {
        this.playAudio(audioData);
    }

    // Handle Tool Calls
    if (msg.toolCall) {
        for (const call of msg.toolCall.functionCalls) {
            if (call.name === 'updateSolarDesign') {
                const args = call.args as any;
                
                // Execute Update
                if (this.onDesignUpdate) {
                    this.onDesignUpdate({
                        meta: args.meta,
                        components: args.components,
                        connections: args.connections
                    }, args.engineerComment);
                }

                // Send Response
                const session = await sessionPromise;
                session.sendToolResponse({
                    functionResponses: {
                        name: call.name,
                        id: call.id,
                        response: { result: 'Design updated successfully' }
                    }
                });
            }
        }
    }
  }

  private async playAudio(b64: string) {
    if (!this.audioContext) return;
    
    // Simple decoding
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    // Manual Int16 to Float32 conversion for PCM16
    const int16 = new Int16Array(bytes.buffer);
    const audioBuffer = this.audioContext.createBuffer(1, int16.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) {
        channelData[i] = int16[i] / 32768.0;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    
    const now = this.audioContext.currentTime;
    const start = Math.max(this.nextStartTime, now);
    source.start(start);
    this.nextStartTime = start + audioBuffer.duration;
  }

  private pcmToB64(data: Float32Array): string {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    const bytes = new Uint8Array(int16.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  disconnect() {
    if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
    }
    if (this.source) {
        this.source.disconnect();
        this.source = null;
    }
    if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
    }
    if (this.inputContext) {
        this.inputContext.close();
        this.inputContext = null;
    }
    if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
    }
    this.session = null;
  }
}

export const liveService = new LiveService();