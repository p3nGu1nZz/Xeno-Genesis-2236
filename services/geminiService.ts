
import { GoogleGenAI, Type } from "@google/genai";
import { Xenobot, AnalysisResult, CellType } from "../types";

// Initialize Gemini with environment API key
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function analyzeXenobot(bot: Xenobot): Promise<AnalysisResult> {
  const { genome, age, energy, irruption, absorption } = bot;

  // Serialize the grid for the LLM
  let gridVisualization = "";
  for (let y = 0; y < genome.gridSize; y++) {
    let row = "";
    for (let x = 0; x < genome.gridSize; x++) {
      const cell = genome.genes[y][x];
      if (cell === CellType.EMPTY) row += ". ";
      else if (cell === CellType.SKIN) row += "S "; // Skin (Passive)
      else if (cell === CellType.HEART) row += "M "; // Muscle (Active)
      else if (cell === CellType.NEURON) row += "N "; // Neuron (Signaling)
    }
    gridVisualization += row.trim() + "\n";
  }

  const prompt = `
    You are a xenobiologist analyzing a synthetic lifeform (Xenobot) in a physics simulation.
    The simulation tracks two Mind-Body Operators based on philosophical biology:
    1. Irruption (Mental Causation): The agent's ability to exert force/will on matter. Current Level: ${irruption.toFixed(2)}
    2. Absorption (Conscious Experience): The agent's intake of sensory/material events. Current Level: ${absorption.toFixed(2)}
    
    Structure Grid (S=Skin, M=Muscle, N=Neuron, .=Empty):
    ${gridVisualization}
    
    Biology Stats:
    - Age: ${age} ticks
    - Energy Reserve: ${energy.toFixed(1)}
    - Bioelectric Plasticity: ${genome.bioelectricMemory.toFixed(3)}
    
    Task:
    1. Analyze its morphology (how its structure might affect movement) considering its Irruption capabilities.
    2. Suggest an evolutionary mutation to improve locomotion efficiency or Absorption (sensing).
    3. Provide a creative scientific species name and brief biological context referring to its Mind-Body coherence.
    
    Output strictly valid JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                analysis: { type: Type.STRING },
                suggestion: { type: Type.STRING },
                biologicalContext: { type: Type.STRING },
            }
        }
      }
    });

    const result = response.text;
    if (!result) return getFallbackAnalysis();
    
    return JSON.parse(result) as AnalysisResult;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return getFallbackAnalysis();
  }
}

function getFallbackAnalysis(): AnalysisResult {
  return {
    analysis: "Neural link offline. Unable to process morphology.",
    suggestion: "Check API configuration.",
    biologicalContext: "Specimen #UNKNOWN"
  };
}
