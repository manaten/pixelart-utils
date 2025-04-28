import { BitmapImage, GifFrame, GifUtil } from "gifwrap";
import Jimp from "jimp";
import { mkdirp } from "mkdirp";
import path from "path";
import url, { fileURLToPath } from "url";

/**
 * ファイルを読み込んでgifwrapのGIFオブジェクトを返す
 */
export async function readGif(fileName: string, basePath: string) {
  const inputPath = fileURLToPath(new URL(fileName, basePath));
  return await GifUtil.read(inputPath.toString());
}

type RegularManipulateOption = {
  x: number;
  y: number;
  w: number;
  h: number;
  frame: number;
  scale: number;
};

type ManipulateOption = Partial<RegularManipulateOption> & {
  name?: string;
  useFrames?: (number | ManipulateOption)[];
  blitImages?: (ManipulateOption & { posX?: number; posY?: number })[];
};

/**
 * 渡されたOptionをフレームごとの設定情報に正規化する
 */
function regularizeOption(
  option: ManipulateOption,
  frameCount: number,
): {
  frames: {
    images: (RegularManipulateOption & { posX: number; posY: number })[];
  }[];
} {
  const outputFrameCount = Math.max(
    frameCount,
    option.useFrames?.length || 0,
    ...(option.blitImages || []).map((bi) => bi.useFrames?.length || 0),
  );

  const frames = Array.from({ length: outputFrameCount }).map((_, index) => {
    function regularizeOneOption({
      useFrames,
      ...opt
    }: ManipulateOption): (RegularManipulateOption & {
      posX: number;
      posY: number;
    })[] {
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

      const fixOption = ({
        useFrames,
        blitImages,
        name,
        ...opt
      }: ManipulateOption) => opt;

      const mainOption = {
        posX: 0,
        posY: 0,
        x: 0,
        y: 0,
        w: 1,
        h: 1,
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
            scale: mainOption.scale * (biOption.scale || 1),
          }).map(({ posX: posXInner, posY: posYInner, ...bio }) => ({
            ...bio,
            posX: posX * mainOption.scale + posXInner,
            posY: posY * mainOption.scale + posYInner,
          })),
        ),
      ];
    }

    return { images: regularizeOneOption(option) };
  });

  return { frames };
}

export type ManipulateOptionWithFileName = ManipulateOption & {
  fileName?: string;
  basePath?: string;
};

/**
 * gifの指定したフレームをクロップ･スケール･合成処理する
 */
export async function manipulate(
  original: Awaited<ReturnType<typeof GifUtil.read>>,
  { fileName = "", basePath = "", ...option }: ManipulateOptionWithFileName,
) {
  function manipulateOneFrame({
    frame,
    x,
    y,
    w,
    h,
    scale,
  }: RegularManipulateOption) {
    const jimp: Jimp = GifUtil.copyAsJimp(Jimp, original.frames[frame]!);
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
      frame: images[0]!.frame,
    });
    jimp.resize(
      Math.max(...images.map((i) => i.posX + i.w * i.scale)),
      Math.max(...images.map((i) => i.posY + i.h * i.scale)),
    );

    for (const biOpt of images) {
      const biJimp = manipulateOneFrame(biOpt);
      jimp.blit(biJimp, biOpt.posX, biOpt.posY);
    }

    const frame = original.frames[images[0]!.frame];
    return new GifFrame(new BitmapImage(jimp.bitmap), { ...frame });
  });

  const outPath = fileName && url.fileURLToPath(new URL(fileName, basePath));
  await mkdirp(path.dirname(outPath));
  console.log(`write ${outPath} (${frames.length} frames)`);

  return await GifUtil.write(outPath, frames, original);
}

export type ManipulateFrameOption = {
  fileName: string;
  basePath: string;
  x: number;
  y: number;
  w: number;
  h: number;
  frame: number;
  scale?: number;
  blitImages?: (Omit<
    ManipulateFrameOption,
    "fileName" | "basePath" | "blitImages"
  > & {
    posX?: number;
    posY?: number;
  })[];
};

/**
 * gifの1フレームをクロップ･スケール処理する
 */
export async function manipulateFrame(
  original: Awaited<ReturnType<typeof GifUtil.read>>,
  { fileName, basePath, ...baseOption }: ManipulateFrameOption,
) {
  function manipulateOneFrame({
    x,
    y,
    w,
    h,
    frame,
    scale,
    blitImages,
  }: Omit<ManipulateFrameOption, "fileName" | "basePath">) {
    const jimp: Jimp = GifUtil.copyAsJimp(Jimp, original.frames[frame]!);
    if (w > 0 && h > 0) {
      jimp.crop(x, y, w, h);
    }

    const fixScale = scale ?? 1;
    if (fixScale !== 1) {
      jimp.scale(fixScale, Jimp.RESIZE_NEAREST_NEIGHBOR);
    }

    if (blitImages) {
      for (const biOpt of blitImages) {
        const biJimp = manipulateOneFrame({
          ...biOpt,
          scale: (biOpt.scale ?? 1) * fixScale,
        });
        jimp.blit(
          biJimp,
          (biOpt.posX ?? 0) * fixScale,
          (biOpt.posY ?? 0) * fixScale,
        );
      }
    }
    return jimp;
  }

  const j = manipulateOneFrame(baseOption);

  const outPath = url.fileURLToPath(new URL(fileName, basePath));
  await mkdirp(path.dirname(outPath));
  await j.writeAsync(outPath.toString());
  console.log(`manipulateFrame done. ${outPath}`);
}
