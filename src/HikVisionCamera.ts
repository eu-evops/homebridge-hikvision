import { StreamingDelegate } from 'homebridge-camera-ffmpeg/dist/streamingDelegate'
import { Logger } from 'homebridge-camera-ffmpeg/dist/logger'
import { CameraConfig } from 'homebridge-camera-ffmpeg/dist/configTypes'

import { Service, CameraControllerOptions } from 'homebridge/lib';

import * as hapNodeJs from 'hap-nodejs'

export class HikVisionCamera {
  log: any;
  config: any;
  any: any;
  camera?: any;
  name: string;
  motionDetected: boolean = false
  context: any;
  homebridgeApi: any
  displayName: string
  UUID: string
  accessory: any

  constructor(log: any, homebridgeApi: any, accessory: any) {
    this.log = log;
    this.homebridgeApi = homebridgeApi;
    this.accessory = accessory;
    this.context = accessory.context;

    this.displayName = this.accessory.displayName
    this.UUID = accessory.UUID;
    this.name = accessory.name;

    this.configure(this.accessory);
  }

  getService(...args: any[]) {
    return this.accessory.getService(...args);
  }

  configureController(...args: any[]) {
    return this.accessory.configureController(...args);
  }

  addService(...args: any[]) {
    return this.accessory.addService(...args);
  }

  removeService(...args: any[]) {
    return this.accessory.removeService(...args);
  }

  on(...args: any[]) {
    this.accessory.on(...args)
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


  configure(accessory: any) {
    this.log.info("[HikvisionCamera] Configuring accessory: ", accessory.displayName);


    accessory.on("identify", () => {
      this.log(`${accessory.displayName} identified!`);
    });

    let motionSensor: hapNodeJs.Service | undefined = accessory.getService(this.homebridgeApi.hap.Service.MotionSensor);
    if (motionSensor) {
      this.log.info("Re-creating motion sensor")
      accessory.removeService(motionSensor);
    } else {
      this.log.warn("There was no motion sensor set up!")
    }

    motionSensor = new this.homebridgeApi.hap.Service.MotionSensor(accessory.displayName);
    accessory.addService(motionSensor!);

    const channelId = accessory.context.channelId;
    const cameraConfig = <CameraConfig>{
      name: accessory.displayName,
      videoConfig: {
        source: `-rtsp_transport tcp -re -i rtsp://${accessory.context.username}:${accessory.context.password}@${accessory.context.host}/Streaming/Channels/${channelId}01`,
        stillImageSource: `-i http${accessory.context.secure ? 's' : ''}://${accessory.context.username}:${accessory.context.password}@${accessory.context.host}/ISAPI/Streaming/channels/${channelId}01/picture?videoResolutionWidth=720`,
        maxFPS: 30,
        maxBitrate: 1800,
        maxWidth: 1920,
        vcodec: "libx264",
        audio: accessory.context.hasAudio,
        debug: true
      }
    }

    const cameraLogger = new Logger(this.log)
    const streamingDelegate = new StreamingDelegate(cameraLogger, cameraConfig, this.homebridgeApi, this.homebridgeApi.hap, '')

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
