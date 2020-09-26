import { HomebridgeAPI } from 'homebridge/lib/api';
import { HikVisionNVR } from './HikVisionNVR';

let Accessory, hap, Service, Characteristic, UUIDGen;

export const HIKVISION_PLUGIN_NAME = 'homebridge-plugin-hikvision';
export const HIKVISION_PLATFORM_NAME = 'Hikvision';

export default function main(api: any) {
    Accessory = api.platformAccessory;
    hap = api.hap;
  Service = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    UUIDGen = api.hap.uuid;
    
    api.registerPlatform(HIKVISION_PLUGIN_NAME, HIKVISION_PLATFORM_NAME, HikVisionNVR);
}