
import { GoogleGenAI } from "@google/genai";
import { Genome, CellType, AnalysisResult } from '../types';

const apiKey = process.env.API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const analyzeXenobot = async (genome: Genome, generationCount: number): Promise<AnalysisResult> => {
  if (!ai) {
    return {
      analysis: "API Key missing. Cannot access Galactic Research Database.",
      suggestion: "Configure process.env.API_KEY.",
      biologicalContext: "N/A"
    };
  }

  let gridStr = "";
  let stats = { skin: 0, heart: 0, neuron: 0, empty: 0 };

  for (const row of genome.genes) {
    gridStr += row.map(cell => {
      if (cell === CellType.SKIN) { stats.skin++; return 'S'; }
      if (cell === CellType.HEART) { stats.heart++; return 'H'; }
      if (cell === CellType.NEURON) { stats.neuron++; return 'N'; }
      stats.empty++;
      return '.';
    }).join(' ') + "\n";
  }

  const prompt = `
    You are Dr. Michael Levin's AI research partner in 2236.
    Analyze this synthetic biological form (Xenobot) based on its morphological grid and fitness.
    
    Data:
    Generation: ${generationCount}
    Fitness (Distance): ${genome.fitness.toFixed(2)}
    Bioelectric Memory (Plasticity Factor): ${genome.bioelectricMemory?.toFixed(3) || '0.500'}
    Composition: Skin=${stats.skin}, Heart=${stats.heart}, Neuron=${stats.neuron}
    Grid Structure:
    ${gridStr}

    Context:
    - This organism evolves via a Genetic Algorithm but also exhibits "Agential Material" properties.
    - "Bioelectric Memory" (0.0-1.0) controls how fast the physical structure adapts to stress (plasticity).
    - We are currently observing a need for "Bilateral Polarity".
    - Anterior should contain Neurons (Sensory/Structural). Posterior should contain Heart cells (Propulsion).

    Tasks:
    1. Analyze the morphology. Is there a clear "Cognitive Light Cone" or are the parts acting as individual cells?
    2. Suggest a "Target Morphology" that introduces Bilateral Polarity (Neurons leading, Heart trailing).
    3. We need to 'canalize' the recent gains. Suggest reducing Bioelectric Memory to approx 0.60 to prevent over-remodeling.

    Output (JSON):
    {
      "analysis": "...",
      "suggestion": "...",
      "biologicalContext": "..."
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);

    return {
      analysis: data.analysis || "Bioelectric pattern undefined.",
      suggestion: data.suggestion || "Increase integration.",
      biologicalContext: data.biologicalContext || "Morphogenetic field stable."
    };
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      analysis: "Bio-link severed.",
      suggestion: "Re-establish uplink.",
      biologicalContext: "Signal lost."
    };
  }
};
