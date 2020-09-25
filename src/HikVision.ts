
import * as hapNodeJs from 'hap-nodejs'
import { HikvisionApi, HikVisionNvrApiConfiguration } from './lib/api';
import { HikVisionCamera } from './HikVisionCamera';
import { HIKVISION_PLATFORM_NAME, HIKVISION_PLUGIN_NAME } from './index'

import { StreamingDelegate } from 'homebridge-camera-ffmpeg/dist/streamingDelegate'
import { Logger } from 'homebridge-camera-ffmpeg/dist/logger'
import { CameraConfig, VideoConfig } from 'homebridge-camera-ffmpeg/dist/configTypes'

export class HikVision {
  private homebridgeApi: any
  private log: any;
  config: any;
  hikVisionApi: HikvisionApi;
  cameras: any[]

  constructor(
    logger: any,
    config: any,
    api: any
  ) {
    this.hikVisionApi = new HikvisionApi(<HikVisionNvrApiConfiguration>(config as unknown))
    this.homebridgeApi = api;
    this.log = logger;
    this.config = config;
    this.cameras = [];

    this.log("Initialising accessories for HikVision");

    this.homebridgeApi.on('didFinishLaunching', this.loadAccessories.bind(this));
  }


  async loadAccessories() {
    console.log("Loading accessories")

    const systemInformation = await this.hikVisionApi.getSystemInfo()
    console.log(systemInformation);
    console.log(this.config);
    this.log.info("Loading cameras from API")

    const self = this;
    const cameras = await this.hikVisionApi.getCameras();
    const homebridgeCameras = cameras
      .map(function (channel: { id: string; name: string }) {
        const cameraConfig = {
          accessory: 'camera',
          name: channel.name,
          uuid: self.homebridgeApi.hap.uuid.generate(channel.id),
          channelId: channel.id
        };

        const camera: any =
          new HikVisionCamera(self.log, Object.assign(cameraConfig, self.config), self.homebridgeApi);

        const cameraAccessoryInfo = camera.getService(self.homebridgeApi.hap.Service.AccessoryInformation);
        cameraAccessoryInfo!.setCharacteristic(self.homebridgeApi.hap.Characteristic.Manufacturer, 'HikVision');
        cameraAccessoryInfo!.setCharacteristic(self.homebridgeApi.hap.Characteristic.Model, systemInformation.DeviceInfo.model);
        cameraAccessoryInfo!.setCharacteristic(self.homebridgeApi.hap.Characteristic.SerialNumber, systemInformation.DeviceInfo.serialNumber);
        cameraAccessoryInfo!.setCharacteristic(self.homebridgeApi.hap.Characteristic.FirmwareRevision, systemInformation.DeviceInfo.firmwareVersion);

        // Only add new cameras that are not cached
        if (!self.cameras.find((x: any) => x.UUID === camera.UUID)) {
          self.configureAccessory(camera); // abusing the configureAccessory here

          self.homebridgeApi.registerPlatformAccessories(HIKVISION_PLUGIN_NAME, HIKVISION_PLATFORM_NAME, [camera]);
        }

        return camera;
      });

    this.log.info("Registering cameras with homebridge");
    this.cameras = homebridgeCameras;

    // Remove cameras that were not in previous call
    // this.cameras.forEach((accessory: PlatformAccessory) => {
    //   if (!cameras.find((x: any) => x.uuid === accessory.UUID)) {
    //     this.homebridgeApi.unregisterPlatformAccessories(HIKVISION_PLUGIN_NAME, HIKVISION_PLATFORM_NAME, [accessory]);
    //   }
    // });


    this.startMonitoring();

  }


  async configureAccessory(accessory: any) {
    this.log(`Configuring accessory ${accessory.displayName}`);

    accessory.on("identify", () => {
      this.log(`${accessory.displayName} identified!`);
    });

    let motion = accessory.getService(this.homebridgeApi.hap.Service.MotionSensor);
    if (motion) {
      accessory.removeService(motion);
    }

    motion = new this.homebridgeApi.hap.Service.MotionSensor(accessory.displayName);
    accessory.addService(motion);






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


    const ffmpegCameraLogger = new Logger(this.log)
    const streamingDelegate = new StreamingDelegate(ffmpegCameraLogger, cameraConfig, this.homebridgeApi, this.homebridgeApi.hap, 'ffmpeg')


    const cameraControllerOptions = <hapNodeJs.CameraControllerOptions>{
      cameraStreamCount: 5, // HomeKit requires at least 2 streams, but 1 is also just fine
      delegate: streamingDelegate,
      streamingOptions: {
        supportedCryptoSuites: [
          this.homebridgeApi.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80
        ],
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
            profiles: [
              this.homebridgeApi.hap.H264Profile.BASELINE,
              this.homebridgeApi.hap.H264Profile.MAIN,
              this.homebridgeApi.hap.H264Profile.HIGH
            ],
            levels: [
              this.homebridgeApi.hap.H264Level.LEVEL3_1,
              this.homebridgeApi.hap.H264Level.LEVEL3_2,
              this.homebridgeApi.hap.H264Level.LEVEL4_0
            ],
          },
        },
        audio: {
          codecs: [
            <hapNodeJs.AudioStreamingCodec>{
              type: hapNodeJs.AudioStreamingCodecType.PCMA,
              samplerate: hapNodeJs.AudioStreamingSamplerate.KHZ_24,
            },
            <hapNodeJs.AudioStreamingCodec>{
              type: hapNodeJs.AudioStreamingCodecType.AAC_ELD,
              samplerate: hapNodeJs.AudioStreamingSamplerate.KHZ_16,
            },
          ],
        },
      },
    };

    const cameraController = new hapNodeJs.CameraController(cameraControllerOptions, false)

    accessory.configureController(cameraController);

    this.cameras.push(accessory);

  }


  startMonitoring() {
    const self = this;
    const processHikVisionEvent = function (event: any) {
      switch (event.EventNotificationAlert.eventType) {
        case 'videoloss':
          console.log("videoloss, nothing to do...");
          break;
        case 'fielddetection':
        case 'shelteralarm':
        case 'VMD':
          const motionDetected = event.EventNotificationAlert.eventState === 'active';
          const channelId = event.EventNotificationAlert.channelID;
          const cameraUuid = self.homebridgeApi.hap.uuid.generate(channelId);

          const camera = self.cameras.find(a => a.UUID === cameraUuid) as HikVisionCamera;
          if (!camera) {
            return console.log('Could not find camera for event', event);
          }

          console.log("Motion detected on camera, triggering motion", camera.name, motionDetected, camera.motionDetected);

          if (motionDetected !== camera.motionDetected) {
            camera.motionDetected = motionDetected;
            camera.getService(hapNodeJs.Service.MotionSensor)
              ?.setCharacteristic(hapNodeJs.Characteristic.MotionDetected, motionDetected);

            setTimeout(() => {
              console.log("Disabling motion detection on camera", camera.name);
              camera.motionDetected = !motionDetected;
              camera.getService(hapNodeJs.Service.MotionSensor)
                ?.setCharacteristic(hapNodeJs.Characteristic.MotionDetected, !motionDetected);
            }, 10000);
          }


        default:
          console.log('event', event);
      }
    }

    this.hikVisionApi.startMonitoringEvents(processHikVisionEvent);
  }


  /*
  fmpeg \
    -rtsp_transport tcp \
    -re \
    -i rtsp://admin:Ma37dXy2019!@10.0.1.186/Streaming/Channels/201 \
    -map 0:0 \
    -vcodec libx265 \
    -pix_fmt yuv420p \
    -r 30 \
    -f rawvideo \
    -tune zerolatency \
    -b:v 299k \
    -bufsize 299k \
    -maxrate 299k \
    -payload_type 99 \
    -ssrc 9224111 \
    -f rtp \
    -srtp_out_suite AES_CM_128_HMAC_SHA1_80 \
    -srtp_out_params Tr6vAbfPrnz3qNRxe644XrPn86OALKDkHGEP6pGl \
    srtp://10.0.1.114:50960?rtcpport=50960&localrtcpport=50960&pkt_size=1316 \
    -loglevel debug
  */

}
