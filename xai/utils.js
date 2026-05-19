import { promises as fs } from "fs";
import path from "path";

export const getXaiPath = (localOutputOverride = false) => {
  const defaultPath = path.resolve(process.cwd(), "images/xai/");
  const envPath = process.env.XAI_PATH
    ? path.resolve(process.env.XAI_PATH)
    : defaultPath;

  return localOutputOverride ? defaultPath : envPath;
};

export const saveImage = async (buffer, fileName, localOutputOverride = false) => {
  const xaiPath = getXaiPath(localOutputOverride);
  const filePath = path.join(xaiPath, fileName);
  await fs.mkdir(xaiPath, { recursive: true });

  try {
    await fs.writeFile(filePath, buffer);
    console.log(`Image saved: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(`Failed to save image to ${filePath}:`, error);
    throw error;
  }
};

const pruneEmpty = (obj) => {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "string" && value.length === 0) continue;
    out[key] = value;
  }
  return out;
};

export const saveMetadata = async (mediaFilePath, metadata) => {
  if (!mediaFilePath) return null;
  const parsed = path.parse(mediaFilePath);
  const sidecarPath = path.join(parsed.dir, `${parsed.name}.json`);
  const payload = pruneEmpty(metadata);

  try {
    await fs.writeFile(sidecarPath, JSON.stringify(payload, null, 2) + "\n");
    console.log(`Metadata saved: ${sidecarPath}`);
    return sidecarPath;
  } catch (error) {
    console.error(`Failed to save metadata to ${sidecarPath}:`, error.message);
    return null;
  }
};
