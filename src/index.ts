import { API } from "homebridge";
import { HikVisionNVR } from "./HikVisionNVR";

export const HIKVISION_PLUGIN_NAME = "homebridge-plugin-hikvision";
export const HIKVISION_PLATFORM_NAME = "Hikvision";

export default function main(api: API) {
  api.registerPlatform(
    HIKVISION_PLUGIN_NAME,
    HIKVISION_PLATFORM_NAME,
    HikVisionNVR
  );
}
