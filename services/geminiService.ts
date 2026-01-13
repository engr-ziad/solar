import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SolarSystemData, INITIAL_SYSTEM, ComponentType } from '../types';

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

// Define the response schema strictly
const solarSystemSchema: Schema = {
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
      description: "A short technical comment from the engineer to the user about the design in Arabic."
    }
  },
  required: ['meta', 'components', 'connections', 'engineerComment']
};

export class GeminiService {
  private ai: GoogleGenAI;
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.API_KEY;
    if (this.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    } else {
      console.error("API_KEY is missing from environment variables.");
    }
  }

  async generateSolarDesign(
    userPrompt: string, 
    currentSystem: SolarSystemData
  ): Promise<{ system: SolarSystemData; comment: string }> {
    if (!this.ai) throw new Error("AI Client not initialized");

    const systemInstruction = `
      You are an expert Senior Solar Energy Engineer (Electrical).
      Your goal is to design a Single Line Diagram (SLD) based on user requirements.
      You must adhere to IEC 60364 and IEC 62446 standards.
      
      The user will describe their needs (e.g., "I need a 10kW system for a house").
      You must update the JSON structure to represent this electrical system.
      
      RULES:
      1. Always include the GRID and a Bidirectional METER.
      2. Match Inverter size to PV capacity (allow 1.1-1.2 DC/AC ratio).
      3. Select appropriate cable sizes (e.g., 4mm2, 6mm2 DC, 10mm2 AC) based on current.
      4. PROTECTION DEVICES (IEC Standards):
         - Add 'DC_BREAKER' (Circuit Breaker/Fuse) between PV/Combiner and Inverter.
         - Add 'DC_SPD' (Surge Protection Device) on the DC side.
         - Add 'AC_BREAKER' immediately after the Inverter.
         - Add 'AC_SPD' at the main distribution point.
      5. The output MUST be valid JSON matching the schema.
      6. Provide a technical response in Arabic in the 'engineerComment' field.
      
      Current System Context: ${JSON.stringify(currentSystem.meta)}
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash', // Using flash for speed/logic balance
        contents: [
          { role: 'user', parts: [{ text: `Current Design State: ${JSON.stringify(currentSystem)}` }] },
          { role: 'user', parts: [{ text: `User Request: ${userPrompt}` }] }
        ],
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: solarSystemSchema,
          temperature: 0.2 // Low temperature for technical precision
        }
      });

      if (response.text) {
        const data = JSON.parse(response.text);
        return {
          system: {
            meta: data.meta,
            components: data.components,
            connections: data.connections
          },
          comment: data.engineerComment
        };
      }
      throw new Error("No response text generated");
    } catch (error) {
      console.error("Gemini generation error:", error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();