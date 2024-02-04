import { BitmapImage, GifFrame, GifUtil } from "gifwrap";
import Jimp from "jimp";
import { mkdirp } from "mkdirp";
import path from "path";
import url, { fileURLToPath } from "url";

/**
 * ファイルを読み込んでgifwrapのGIFオブジェクトを返す
 * @param {string} fileName
 * @param {string} basePath
 * @returns {Promise<import("gifwrap").Gif>}
 */
export async function readGif(fileName, basePath) {
  const inputPath = fileURLToPath(new URL(fileName, basePath));
  return await GifUtil.read(inputPath.toString());
}

/**
 * @typedef {{
 *   x: number;
 *   y: number;
 *   w: number;
 *   h: number;
 *   frame: number
 *   scale: number;
 * }} RegularManipulateOption
 */

/**
 * @typedef {Partial<RegularManipulateOption> & {
 *   name?: string;
 *   useFrames?: (number | ManipulateOption)[];
 *   blitImages?: (ManipulateOption & { posX?: number, posY?: number } )[];
 * }} ManipulateOption
 */

/**
 * 渡されたOptionをフレームごとの設定情報に正規化する
 *
 * @param {ManipulateOption} option
 * @param {number} frameCount
 *
 * @returns {{
 *   frames: ({
 *     images: (RegularManipulateOption & { posX: number, posY: number })[]
 *   })[]
 * }}
 */
function regularizeOption(option, frameCount) {
  const outputFrameCount = Math.max(
    frameCount,
    option.useFrames?.length || 0,
    ...(option.blitImages || []).map((bi) => bi.useFrames?.length || 0),
  );

  const frames = Array.from({ length: outputFrameCount }).map((_, index) => {
    /**
     * @param {ManipulateOption} option
     * @returns {(RegularManipulateOption & { posX: number, posY: number })[]}
     */
    function regularizeOneOption({ useFrames, ...opt }) {
      const currentUseFrame = useFrames && useFrames[index % useFrames.length];

      const fixedFrame =
        (() => {
          if (typeof currentUseFrame === "number") {
            return currentUseFrame;
          } else if (typeof currentUseFrame?.frame === "number") {
            return currentUseFrame.frame;
          } else if (typeof opt.frame === "number") {
            return opt.frame;
          }
          return index;
        })() % frameCount;

      /**
       * @param {ManipulateOption} option
       * @returns {Partial<RegularManipulateOption>}
       */
      const fixOption = ({ useFrames, blitImages, name, ...opt }) => opt;

      const mainOption = {
        posX: 0,
        posY: 0,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        scale: 1,
        ...fixOption(opt),
        ...fixOption(
          typeof currentUseFrame === "object" ? currentUseFrame : {},
        ),
        frame: fixedFrame,
      };

      const blitImages = [
        ...(opt.blitImages ? opt.blitImages : []),
        ...(typeof currentUseFrame === "object" && currentUseFrame.blitImages
          ? currentUseFrame.blitImages
          : []),
      ];

      return [
        mainOption,

        ...blitImages.flatMap(({ posX = 0, posY = 0, ...biOption }) =>
          regularizeOneOption({
            ...mainOption,
            ...biOption,
          }).map(({ posX: posXInner, posY: posYInner, ...bio }) => ({
            ...bio,
            posX: posX * bio.scale + posXInner,
            posY: posY * bio.scale + posYInner,
          })),
        ),
      ];
    }

    return { images: regularizeOneOption(option) };
  });

  return { frames };
}

/**
 * @typedef {ManipulateOption & {
 *   fileName?: string;
 *   basePath?: string;
 * }} ManipulateOptionWithFileName
 */

/**
 * gifの指定したフレームをクロップ･スケール･合成処理する
 *
 * @param {Awaited<ReturnType<GifUtil.read>>} original
 * @param {ManipulateOptionWithFileName} options
 */
export async function manipulate(
  original,
  { fileName = "", basePath = "", ...option },
) {
  /**
   * @param {RegularManipulateOption} option
   */
  function manipulateOneFrame({ frame, x, y, w, h, scale }) {
    /** @type {import("jimp")} */
    const jimp = GifUtil.copyAsJimp(Jimp, original.frames[frame]);
    if (w > 0 && h > 0) {
      jimp.crop(x, y, w, h);
    }
    if (scale !== 1) {
      jimp.scale(scale, Jimp.RESIZE_NEAREST_NEIGHBOR);
    }
    return jimp;
  }

  const regularizedOption = regularizeOption(option, original.frames.length);
  // console.log(JSON.stringify(regularizedOption, null, 2));

  const frames = regularizedOption.frames.map(({ images }) => {
    const jimp = manipulateOneFrame({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      scale: 1,
      frame: images[0].frame,
    });
    jimp.resize(
      Math.max(...images.map((i) => i.posX + i.w * i.scale)),
      Math.max(...images.map((i) => i.posY + i.h * i.scale)),
    );

    for (const biOpt of images) {
      const biJimp = manipulateOneFrame(biOpt);
      jimp.blit(biJimp, biOpt.posX, biOpt.posY);
    }

    const frame = original.frames[images[0].frame];
    return new GifFrame(new BitmapImage(jimp.bitmap), { ...frame });
  });

  const outPath = fileName && url.fileURLToPath(new URL(fileName, basePath));
  await mkdirp(path.dirname(outPath));
  console.log(`write ${outPath} (${frames.length} frames)`);

  return await GifUtil.write(outPath, frames, original);
}

/**
 * gifの1フレームをクロップ･スケール処理する
 *
 * @param {Awaited<ReturnType<GifUtil.read>>} original
 * @param {{
 *  fileName: string;
 *  basePath: string;
 *  x: number;
 *  y: number;
 *  w: number;
 *  h: number;
 *  frame: number;
 *  scale?: number;
 * }} options
 */
export async function manipulateFrame(
  original,
  { fileName, basePath, x, y, w, h, frame, scale = 1 },
) {
  const f = original.frames[frame];

  /** @type {import('jimp')} */
  const j = GifUtil.copyAsJimp(Jimp, f).crop(x, y, w, h);
  if (scale !== 1) {
    j.scale(5, Jimp.RESIZE_NEAREST_NEIGHBOR);
  }

  const outPath = url.fileURLToPath(new URL(fileName, basePath));
  await mkdirp(path.dirname(outPath));
  await j.writeAsync(outPath.toString());
  console.log(`manipulateFrame done. ${outPath}`);
}
