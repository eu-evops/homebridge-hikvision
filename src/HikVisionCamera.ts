import { StreamingDelegate } from 'homebridge-camera-ffmpeg/dist/streamingDelegate'
import { Logger } from 'homebridge-camera-ffmpeg/dist/logger'
import { CameraConfig } from 'homebridge-camera-ffmpeg/dist/configTypes'

import * as homebridge from 'homebridge';
import { Service, CameraController, CameraControllerOptions } from 'homebridge/lib';

import { PlatformAccessory } from 'homebridge/lib/platformAccessory'
import * as hapNodeJs from 'hap-nodejs'
import { CameraStreamingDelegate } from 'hap-nodejs/dist'
import { HikvisionApi as HikVisionApi, HikVisionNvrApiConfiguration } from './lib/api';
import { HomebridgeAPI, API } from 'homebridge/lib/api';

export class HikVisionCamera extends PlatformAccessory {
  log: homebridge.Logging;
  config: homebridge.AccessoryConfig;
  homebridgeApi: homebridge.API;
  camera?: homebridge.PlatformAccessory;
  name: string;
  motionDetected: boolean = false
  context: homebridge.AccessoryConfig;

  constructor(logger: homebridge.Logging, config: homebridge.AccessoryConfig, api: API) {
    super(config.name, config.uuid, homebridge.Categories.CAMERA);

    this.context = config;
    this.log = logger;
    this.config = config;
    this.homebridgeApi = api;
    this.name = config.name;
    console.log("Initialising camera", config);
    this.camera = new api.platformAccessory(config.name, this.UUID);
    this.camera.category = api.hap.Categories.CAMERA;
    const motionService = new api.hap.Service.MotionSensor(config.name, "");
    this.camera.addService(motionService);
    this.camera.context = {
      channelId: config.channelId
    };
    this.camera.getService(api.hap.Service.AccessoryInformation)!
      .setCharacteristic(api.hap.Characteristic.Name, config.name);

    this.configure(this.camera);
  }
  /**
       *
       * @param uuid
       * @param subType
       * @deprecated use {@link getServiceById} directly
       */
  getServiceByUUIDAndSubType<T extends hapNodeJs.WithUUID<typeof Service>>(uuid: string | T, subType: string): Service | undefined {
    return undefined;
  }


  configure(accessory: homebridge.PlatformAccessory) {
    this.log.info("Loading accessory...", accessory.context);
    const channelId = accessory.context.channelId;
    const cameraConfig = <CameraConfig>{
      name: accessory.displayName,
      videoConfig: {
        source: `-rtsp_transport tcp -re -i rtsp://${this.config.username}:${this.config.password}@${this.config.host}/Streaming/Channels/${channelId}01`,
        stillImageSource: `-i http${this.config.secure ? 's' : ''}://${this.config.username}:${this.config.password}@${this.config.host}/ISAPI/Streaming/channels/${channelId}01/picture?videoResolutionWidth=720`,
        maxFPS: 30,
        maxBitrate: 1800,
        maxWidth: 1920,
        vcodec: "libx264",
        audio: true,
        debug: true
      }
    }

    const cameraLogger = new Logger(this.log)
    const streamingDelegate = new StreamingDelegate(cameraLogger, cameraConfig, this.homebridgeApi, this.homebridgeApi.hap, 'ffmpeg')

    const cameraControllerOptions = <CameraControllerOptions>{
      cameraStreamCount: 5, // HomeKit requires at least 2 streams, but 1 is also just fine
      delegate: streamingDelegate,
      streamingOptions: {
        supportedCryptoSuites: [this.homebridgeApi.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
        video: {
          resolutions: [
            [320, 180, 30],
            [320, 240, 15], // Apple Watch requires this configuration
            [320, 240, 30],
            [480, 270, 30],
            [480, 360, 30],
            [640, 360, 30],
            [640, 480, 30],
            [1280, 720, 30],
            [1280, 960, 30],
            [1920, 1080, 30],
            [1600, 1200, 30],
          ],
          codec: {
            profiles: [this.homebridgeApi.hap.H264Profile.BASELINE, this.homebridgeApi.hap.H264Profile.MAIN, this.homebridgeApi.hap.H264Profile.HIGH],
            levels: [this.homebridgeApi.hap.H264Level.LEVEL3_1, this.homebridgeApi.hap.H264Level.LEVEL3_2, this.homebridgeApi.hap.H264Level.LEVEL4_0],
          },
        },
        audio: {
          codecs: [
            {
              type: hapNodeJs.AudioStreamingCodecType.OPUS,
              samplerate: hapNodeJs.AudioStreamingSamplerate.KHZ_24,
            },
            {
              type: hapNodeJs.AudioStreamingCodecType.AAC_ELD,
              samplerate: hapNodeJs.AudioStreamingSamplerate.KHZ_16,
            },
          ],
        },
      },
    };

    const cameraController = new hapNodeJs.CameraController(cameraControllerOptions)

    accessory.configureController(cameraController);
  }
}
