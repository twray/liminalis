import { color, math } from "canvas-sketch-util";
import type { IsometricPosition, Point2D } from "../types/index.js";
import IsometricViewTileFaceType from "./IsometricViewTileFaceType.js";

interface TileData {
  type: IsometricViewTileFaceType;
  points: Point2D[];
  fill: string;
  stroke: string;
  opacity: number;
  debugMode: boolean;
}

interface TileWithPosition extends TileData {
  position: IsometricPosition;
}

interface TileCoordinates {
  center: Point2D;
  top: Point2D;
  right: Point2D;
  bottom: Point2D;
  left: Point2D;
  tiles: TileWithPosition[];
}

class IsometricView {
  private static readonly DEFAULT_FILL_COLOR = "#333333";
  private static readonly DEFAULT_STROKE_COLOR = "transparent";

  public readonly context: CanvasRenderingContext2D;
  public readonly contextWidth: number;
  public readonly contextHeight: number;
  public readonly tileWidth: number;
  public readonly tileHeight: number;
  private readonly numGridColumns: number;
  private readonly numGridRows: number;
  private readonly startofGridXPosition: number;
  private readonly startofGridYPosition: number;
  private readonly isometricGrid: TileCoordinates[][];

  constructor(
    context: CanvasRenderingContext2D,
    contextWidth: number,
    contextHeight: number,
    tileWidth = 50
  ) {
    const isometricGrid: TileCoordinates[][] = [];

    const tileHeight = tileWidth / 2;

    const numGridColumns = (Math.floor(contextWidth / tileWidth) + 2) * 2;
    const numGridRows = (Math.floor(contextHeight / tileHeight) + 2) * 2;

    const startofGridXPosition = (contextWidth % tileWidth) / 2 - tileWidth;
    const startofGridYPosition = (contextHeight % tileHeight) / 2 - tileHeight;

    this.isometricGrid = [];

    for (let i = 0; i < numGridColumns; i++) {
      const gridRowsInGridColumns = [];

      for (let j = 0; j < numGridRows; j++) {
        const tileCoordinates = {
          center: {
            x: startofGridXPosition + (tileWidth * i) / 2 + tileWidth * 0.5,
            y: startofGridYPosition + (tileHeight * j) / 2 + tileHeight * 0.5,
          },
        };

        gridRowsInGridColumns.push({
          ...tileCoordinates,
          top: {
            x: tileCoordinates.center.x,
            y: tileCoordinates.center.y - tileHeight / 2,
          },
          right: {
            x: tileCoordinates.center.x + tileWidth / 2,
            y: tileCoordinates.center.y,
          },
          bottom: {
            x: tileCoordinates.center.x,
            y: tileCoordinates.center.y + tileHeight / 2,
          },
          left: {
            x: tileCoordinates.center.x - tileWidth / 2,
            y: tileCoordinates.center.y,
          },
          tiles: [],
        });
      }

      isometricGrid.push(gridRowsInGridColumns);
    }

    this.context = context;
    this.contextWidth = contextWidth;
    this.contextHeight = contextHeight;

    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;

    this.numGridColumns = numGridColumns;
    this.numGridRows = numGridRows;

    this.startofGridXPosition = startofGridXPosition;
    this.startofGridYPosition = startofGridYPosition;

    this.isometricGrid = isometricGrid;
  }

  showBaseGrid(): void {
    const {
      context,
      contextWidth,
      contextHeight,
      tileWidth,
      tileHeight,
      numGridRows,
      numGridColumns,
      startofGridXPosition,
      startofGridYPosition,
    } = this;

    context.save();

    context.strokeStyle = "rgba(255, 255, 255, 0.3)";
    context.lineWidth = 1;
    context.setLineDash([1, 1]);

    for (let i = 0; i < numGridColumns; i++) {
      context.beginPath();

      context.moveTo(
        startofGridXPosition + (tileWidth / 2) * (i + 1),
        startofGridYPosition
      );

      context.lineTo(
        startofGridXPosition + (tileWidth / 2) * (i + 1),
        startofGridYPosition + contextHeight + (1 - startofGridYPosition) * 2
      );

      context.stroke();
    }

    for (let i = 0; i < numGridRows; i++) {
      context.beginPath();

      context.moveTo(
        startofGridXPosition,
        startofGridYPosition + (tileHeight / 2) * (i + 1)
      );

      context.lineTo(
        startofGridXPosition + contextWidth + (1 - startofGridXPosition) * 2,
        startofGridYPosition + (tileHeight / 2) * (i + 1)
      );

      context.stroke();
    }

    context.restore();
  }

  showIsometricGrid(): void {
    const { isometricGrid } = this;

    // Horrible, brute force method that just attempts to render as many tiles
    // as possible within the screen space based on an estimation. Will fix.

    if (!isometricGrid[0]) return;

    let maxValuePerAxis = Math.max(
      isometricGrid.length,
      isometricGrid[0].length
    );

    for (let x = -maxValuePerAxis; x < maxValuePerAxis / 2; x++) {
      for (let y = -maxValuePerAxis; y < maxValuePerAxis / 2; y++) {
        try {
          this.addTileAt({
            isoX: x,
            isoY: y,
            isoZ: 0,
            type: IsometricViewTileFaceType.BASE,
            width: 1,
            height: 1,
            debugMode: true,
          });
        } catch (error) {
          // Sad face goes here
        }
      }
    }
  }

  getMidPoint(x1: number, y1: number, x2: number, y2: number): Point2D {
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }

  getOriginCellIndices(): Point2D {
    const { numGridRows, numGridColumns } = this;
    return {
      x: Math.floor(numGridColumns / 2) - 1,
      y: Math.floor(numGridRows / 2) - 1,
    };
  }

  getTileSpatialCoordinates(
    isoX: number,
    isoY: number,
    isoZ: number
  ): TileCoordinates | undefined {
    const { isometricGrid } = this;

    const originCellIndices = this.getOriginCellIndices();

    const xIndex = originCellIndices.x + (isoX + isoZ) - (isoY + isoZ);
    const yIndex = originCellIndices.y - (isoX + isoZ) - (isoY + isoZ);

    const row = isometricGrid[xIndex];

    return row && row[yIndex];
  }

  addTileForRendering(isoX: number, isoY: number, isoZ: number, tileData: any) {
    const originCellIndices = this.getOriginCellIndices();

    const xIndex = originCellIndices.x + (isoX + isoZ) - (isoY + isoZ);
    const yIndex = originCellIndices.y - (isoX + isoZ) - (isoY + isoZ);

    const row = this.isometricGrid[xIndex];
    if (row && row[yIndex]) {
      row[yIndex].tiles.push({ ...tileData, position: { isoX, isoY, isoZ } });
    }
  }

  addTileAt({
    isoX = 0,
    isoY = 0,
    isoZ = 0,
    type = IsometricViewTileFaceType.BASE,
    width = 1,
    height = 1,
    fill = IsometricView.DEFAULT_FILL_COLOR,
    stroke = IsometricView.DEFAULT_STROKE_COLOR,
    opacity = 1,
    translateX = 0,
    translateY = 0,
    translateZ = 0,
    scale = 1,
    debugMode = false,
  }) {
    const { tileWidth, tileHeight } = this;
    const { lerp } = math;

    const tileSpatialCoordinates = this.getTileSpatialCoordinates(
      isoX,
      isoY,
      isoZ
    );

    if (tileSpatialCoordinates) {
      const { top, right, bottom, left } = tileSpatialCoordinates;

      let points;

      switch (type) {
        case IsometricViewTileFaceType.BASE:
        default: {
          points = [
            {
              x:
                top.x +
                (width - 1) * (tileWidth / 2) -
                (height - 1) * (tileWidth / 2),
              y:
                top.y +
                (width - 1) * -(tileHeight / 2) +
                (height - 1) * -(tileHeight / 2),
            },
            {
              x: right.x + (width - 1) * (tileWidth / 2),
              y: right.y - (width - 1) * (tileHeight / 2),
            },
            {
              x: bottom.x,
              y: bottom.y,
            },
            {
              x: left.x + (height - 1) * -(tileWidth / 2),
              y: left.y + (height - 1) * -(tileHeight / 2),
            },
          ];

          break;
        }
        case IsometricViewTileFaceType.SIDE_RIGHT: {
          points = [
            {
              x: top.x,
              y: top.y + (height - 1) * -tileHeight,
            },
            {
              x: right.x + (width - 1) * (tileWidth / 2),
              y:
                right.y -
                tileHeight +
                (width - 1) * -(tileHeight / 2) +
                (height - 1) * -tileHeight,
            },
            {
              x: bottom.x + tileWidth / 2 + (width - 1) * (tileWidth / 2),
              y: bottom.y - tileHeight / 2 + (width - 1) * -(tileHeight / 2),
            },
            {
              x: left.x + tileWidth / 2,
              y: left.y + tileHeight / 2,
            },
          ];
          break;
        }
        case IsometricViewTileFaceType.SIDE_LEFT: {
          points = [
            {
              x: top.x,
              y: top.y + (height - 1) * -tileHeight,
            },
            {
              x: right.x - tileWidth / 2,
              y: right.y + tileHeight / 2,
            },
            {
              x: bottom.x - tileWidth / 2 + (width - 1) * -(tileWidth / 2),
              y: bottom.y - tileHeight / 2 + (width - 1) * -(tileHeight / 2),
            },
            {
              x: left.x + (width - 1) * -(tileWidth / 2),
              y:
                left.y -
                tileHeight +
                (width - 1) * -(tileHeight / 2) +
                (height - 1) * -tileHeight,
            },
          ];
          break;
        }
      }

      if (!points || !points[0] || !points[2]) return;

      const midPoint = this.getMidPoint(
        points[0].x,
        points[0].y,
        points[2].x,
        points[2].y
      );

      if (scale !== 1.0) {
        points = points.map((point) => ({
          x: lerp(point.x, midPoint.x, 1 - scale),
          y: lerp(point.y, midPoint.y, 1 - scale),
        }));
      }

      if (translateX !== 0) {
        points = points.map((point) => ({
          x: point.x + translateX,
          y: point.y + -(translateX * 0.5),
        }));
      }

      if (translateY !== 0) {
        points = points.map((point) => ({
          x: point.x + -translateY,
          y: point.y + -(translateY * 0.5),
        }));
      }

      if (translateZ !== 0) {
        points = points.map((point) => ({
          x: point.x,
          y: point.y - translateZ,
        }));
      }

      this.addTileForRendering(isoX, isoY, isoZ, {
        type,
        points,
        fill,
        stroke,
        opacity,
        debugMode,
      });
    } else {
      console.error(
        "Unable to render isometric tile. " +
          "Please ensure that your co-ordinates are within bounds."
      );
    }
  }

  addCuboidAt({
    isoX = 0,
    isoY = 0,
    isoZ = 0,
    lengthX = 1,
    lengthY = 1,
    lengthZ = 1,
    fill = IsometricView.DEFAULT_FILL_COLOR,
    stroke = IsometricView.DEFAULT_STROKE_COLOR,
    opacity = 1,
    translateX = 0,
    translateY = 0,
    translateZ = 0,
  }) {
    this.addTileAt({
      type: IsometricViewTileFaceType.SIDE_RIGHT,
      isoX,
      isoY,
      isoZ,
      width: lengthX,
      height: lengthZ,
      fill,
      stroke,
      opacity,
      translateX,
      translateY,
      translateZ,
    });
    this.addTileAt({
      type: IsometricViewTileFaceType.SIDE_LEFT,
      isoX,
      isoY,
      isoZ,
      width: lengthY,
      height: lengthZ,
      fill,
      stroke,
      opacity,
      translateX,
      translateY,
      translateZ,
    });
    this.addTileAt({
      type: IsometricViewTileFaceType.BASE,
      isoX: isoX + lengthZ,
      isoY: isoY + lengthZ,
      isoZ,
      width: lengthX,
      height: lengthY,
      fill,
      stroke,
      opacity,
      translateX,
      translateY,
      translateZ,
    });
  }

  renderTile({
    type,
    points,
    fill,
    stroke,
    opacity,
    debugMode,
  }: TileData): void {
    const { context } = this;
    const { parse, offsetHSL } = color;

    context.save();
    context.beginPath();
    context.lineWidth = 2;

    if (type === IsometricViewTileFaceType.BASE && debugMode) {
      context.font = "bold 12px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "rgba(255, 255, 255, 0.7)";

      context.strokeStyle = "rgba(255, 255, 255, 0.1)";
      context.fillStyle = "rgba(255, 255, 255, 0.2)";
    } else {
      let renderedFill: string;
      let colorRgb: number[];

      if (fill !== "transparent") {
        switch (type) {
          case IsometricViewTileFaceType.BASE:
          default: {
            colorRgb = parse(fill).rgb;
            break;
          }
          case IsometricViewTileFaceType.SIDE_RIGHT: {
            colorRgb = offsetHSL(fill, 0, 0, -5).rgb;
            break;
          }
          case IsometricViewTileFaceType.SIDE_LEFT: {
            colorRgb = offsetHSL(fill, 0, 0, 5).rgb;
            break;
          }
        }

        renderedFill = `rgba(${colorRgb[0]}, ${colorRgb[1]}, ${colorRgb[2]}, ${opacity})`;
      } else {
        renderedFill = fill;
      }

      context.fillStyle = renderedFill;
      context.strokeStyle = stroke;
    }

    points.forEach((point: Point2D, i: number) => {
      const { x, y } = point;

      if (i === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });

    context.closePath();
    context.stroke();
    context.fill();
    context.restore();
  }

  render(withZCorrection: boolean = true): void {
    const { isometricGrid } = this;

    const isometricGridPointsThatHaveRenderableTiles = isometricGrid
      .flat(1)
      .filter((isometricGridTile) => isometricGridTile.tiles.length > 0);

    if (withZCorrection) {
      // Rendering with z correction
      isometricGridPointsThatHaveRenderableTiles
        .map(({ tiles }) => tiles)
        .flat(1)
        .toSorted((a, b) => {
          if (a.position.isoZ !== b.position.isoZ) {
            return a.position.isoZ - b.position.isoZ;
          }

          if (a.position.isoY !== b.position.isoY) {
            return b.position.isoY - a.position.isoY;
          }

          if (a.position.isoX !== b.position.isoX) {
            return b.position.isoX - a.position.isoX;
          }

          return 0;
        })
        .forEach((renderableTile) => {
          this.renderTile(renderableTile);
        });
    } else {
      // (Possibly faster?) rendering method without z correction
      isometricGridPointsThatHaveRenderableTiles.forEach(({ tiles }) => {
        tiles.forEach((tile) => {
          this.renderTile(tile);
        });
      });
    }
  }
}

export default IsometricView;
