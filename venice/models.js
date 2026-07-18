import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FALLBACK_DEFAULT = "chroma";
const DEFAULT_CONSTRAINTS = {
  widthHeightDivisor: 16,
  maxSteps: 50,
  defaultSteps: 30,
  promptCharacterLimit: 1500,
};

let modelData = {
  defaultModel: FALLBACK_DEFAULT,
  modelEndpoints: {},
  modelConstraints: {},
  modelInfo: {},
  stylePresets: [],
};

try {
  const modelsPath = path.join(__dirname, "models.json");
  const fileContent = await readFile(modelsPath, "utf8");
  const loaded = JSON.parse(fileContent);
  const imageModels = (loaded.data || []).filter((model) => model.type === "image");

  const preferred = imageModels.find((m) => m.id === FALLBACK_DEFAULT);
  modelData.defaultModel = preferred?.id || imageModels[0]?.id || FALLBACK_DEFAULT;

  for (const model of imageModels) {
    modelData.modelEndpoints[model.id] = model.id;

    const constraints = model.model_spec?.constraints;
    if (constraints) {
      modelData.modelConstraints[model.id] = {
        widthHeightDivisor: constraints.widthHeightDivisor || 16,
        maxSteps: constraints.steps?.max || 50,
        defaultSteps: constraints.steps?.default || 20,
        promptCharacterLimit: constraints.promptCharacterLimit || 1500,
        // Resolution-tier models (seedream-v5-pro, gpt-image-2, nano-banana-*)
        // take aspect_ratio + resolution instead of width/height — and bill by
        // tier, defaulting to defaultResolution when none is sent.
        resolutions: constraints.resolutions || null,
        defaultResolution: constraints.defaultResolution || null,
        aspectRatios: constraints.aspectRatios || null,
        qualities: constraints.qualities || null,
        defaultQuality: constraints.defaultQuality || null,
      };
    }

    if (model.model_spec) {
      modelData.modelInfo[model.id] = {
        name: model.model_spec.name || model.id,
        traits: model.model_spec.traits || [],
        modelSource: model.model_spec.modelSource || "",
      };
    }
  }
} catch (error) {
  console.warn("Could not read models.json, using default models:", error.message);
}

export const modelEndpoints = modelData.modelEndpoints;
export const defaultModel = modelData.defaultModel;
export const modelConstraints = modelData.modelConstraints;
export const modelInfo = modelData.modelInfo;
export const stylePresets = modelData.stylePresets;

export function getModelEndpoint(modelKey) {
  if (modelKey && !modelEndpoints[modelKey]) {
    console.warn(`\nWarning: Model '${modelKey}' not found. Using default model '${modelData.defaultModel}' instead.`);
    console.warn(`Available models: ${Object.keys(modelEndpoints).join(", ")}\n`);
  }
  return modelEndpoints[modelKey] || modelData.defaultModel;
}

export function getModelConstraints(modelKey) {
  const effectiveModel = modelEndpoints[modelKey] || modelData.defaultModel;
  return modelConstraints[effectiveModel] || DEFAULT_CONSTRAINTS;
}
