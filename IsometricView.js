const { math, color } = require('canvas-sketch-util');

import IsometricViewTileFaceType from './IsometricViewTileFaceType';

class IsometricView {
  constructor(
    context, 
    contextWidth, 
    contextHeight, 
    tileWidth = 100
  ) {
    const isometricGrid = [];

    const tileHeight = tileWidth / 2

    const numGridColumns = (Math.floor(contextWidth / tileWidth) + 2) * 2;
    const numGridRows = (Math.floor(contextHeight / tileHeight) + 2) * 2;

    const startofGridXPosition = 
      ((contextWidth % tileWidth) / 2) - tileWidth;

    const startofGridYPosition = 
      ((contextHeight % tileHeight) / 2) - tileHeight;

    this.isometricGrid = [];

    for (let i = 0; i < numGridColumns; i++) {
      const gridRowsInGridColumns = [];
  
      for (let j = 0; j < numGridRows; j++) {
        const tileCoordinates = {
          center: { 
            x: startofGridXPosition + ((tileWidth * i) / 2) + tileWidth * 0.5, 
            y: startofGridYPosition + ((tileHeight * j) / 2) + tileHeight * 0.5,
          }
        };
        
        gridRowsInGridColumns.push({
          ...tileCoordinates,
          top: { 
            x: tileCoordinates.center.x,
            y: tileCoordinates.center.y - (tileHeight / 2),
          },
          right: { 
            x: tileCoordinates.center.x + (tileWidth / 2),
            y: tileCoordinates.center.y,
          },
          bottom: { 
            x: tileCoordinates.center.x,
            y: tileCoordinates.center.y + (tileHeight / 2),
          },
          left: { 
            x: tileCoordinates.center.x - (tileWidth / 2),
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

  showBaseGrid() {
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

    context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    context.lineWidth = 1;
    context.setLineDash([1, 1]);

    for (let i = 0; i < numGridColumns; i++) {
      context.beginPath();
      
      context.moveTo(
        startofGridXPosition + ((tileWidth / 2) * (i + 1)), 
        startofGridYPosition,
      );
  
      context.lineTo(
        startofGridXPosition + ((tileWidth / 2) * (i + 1)),
        startofGridYPosition + contextHeight + ((1 - startofGridYPosition) * 2),
      );
  
      context.stroke();
    }
  
    for (let i = 0; i < numGridRows; i++) {
      context.beginPath();
  
      context.moveTo(
        startofGridXPosition, 
        startofGridYPosition + ((tileHeight / 2) * (i + 1)),
      );
  
      context.lineTo(
        startofGridXPosition + contextWidth + ((1 - startofGridXPosition) * 2), 
        startofGridYPosition + ((tileHeight / 2) * (i + 1)),
      );
  
      context.stroke();
    }

    context.restore();
  }

  showIsometricGrid() {
    const { isometricGrid } = this;

    // Horrible, brute force method that just attempts to render as many tiles
    // as possible within the screen space based on an estimation. Will fix.

    let maxValuePerAxis = 
      Math.max(isometricGrid.length, isometricGrid[0].length);
    
    for (let x = -maxValuePerAxis; x < (maxValuePerAxis / 2); x++) {
      for (let y = -maxValuePerAxis; y < (maxValuePerAxis / 2); y++) {
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

  getMidPoint(x1, y1, x2, y2) {
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }

  getOriginCellIndices() {
    const { numGridRows, numGridColumns } = this;

    return {
      x: Math.floor(numGridColumns / 2) - 1,
      y: Math.floor(numGridRows / 2) - 1,
    }
  }

  getTileSpatialCoordinates(isoX, isoY, isoZ) {
    const { isometricGrid } = this;

    const originCellIndices = this.getOriginCellIndices();

    return isometricGrid
            [originCellIndices.x + (isoX + isoZ) - (isoY + isoZ)]
        && isometricGrid
            [originCellIndices.x + (isoX + isoZ) - (isoY + isoZ)]
            [originCellIndices.y - (isoX + isoZ) - (isoY + isoZ)];
  }

  addTileForRendering(isoX, isoY, isoZ, tileData) {
    const originCellIndices = this.getOriginCellIndices();

    this.isometricGrid
      [originCellIndices.x + (isoX + isoZ) - (isoY + isoZ)]
      [originCellIndices.y - (isoX + isoZ) - (isoY + isoZ)]
        .tiles.push({...tileData, position: { isoX, isoY, isoZ } });
  }

  addTileAt({
    isoX,
    isoY,
    isoZ,
    type = IsometricViewTileFaceType.BASE,
    width = 1,
    height = 1,
    fill = '#333333',
    stroke = 'transparent',
    opacity = 1,
    translateX = 0,
    translateY = 0,
    translateZ = 0,
    scale = 1,
    debugMode = false,
  }) {
    const { tileWidth, tileHeight } = this;
    const { lerp } = math;

    const tileSpatialCoordinates = 
      this.getTileSpatialCoordinates(isoX, isoY, isoZ);

    if (tileSpatialCoordinates) {
      const { center, top, right, bottom, left } = tileSpatialCoordinates;
              
      let points;

      switch (type) {
        case IsometricViewTileFaceType.BASE:
        default: {
          points = [
            {
              x: top.x + ((width - 1) * (tileWidth / 2)) 
                - ((height - 1) * (tileWidth / 2)),
              y: top.y + ((width - 1) * -(tileHeight / 2)) 
                + ((height - 1) * -(tileHeight / 2)),
            },
            {
              x: right.x + ((width - 1) * (tileWidth / 2)),
              y: right.y - ((width - 1) * (tileHeight / 2)),
            },
            {
              x: bottom.x,
              y: bottom.y,
            },
            {
              x: left.x + ((height - 1) * -(tileWidth / 2)),
              y: left.y + ((height - 1) * -(tileHeight / 2)),
            },
          ];
          
          break;
        }
        case IsometricViewTileFaceType.SIDE_RIGHT: {
          points = [
            {
              x: top.x,
              y: top.y + ((height - 1) * -tileHeight),
            },
            {
              x: right.x + ((width - 1) * (tileWidth / 2)),
              y: right.y - (tileHeight) + ((width - 1) * -(tileHeight / 2)) 
                + ((height - 1) * -tileHeight),
            },
            {
              x: bottom.x + (tileWidth / 2) + ((width - 1) * (tileWidth / 2)),
              y: bottom.y - (tileHeight / 2) + ((width - 1) * -(tileHeight / 2)),
            },
            {
              x: left.x + (tileWidth / 2),
              y: left.y + (tileHeight / 2),
            },
          ]
          break;  
        }
        case IsometricViewTileFaceType.SIDE_LEFT: {
          points = [
            {
              x: top.x,
              y: top.y + ((height - 1) * -tileHeight),
            },
            {
              x: right.x - (tileWidth / 2),
              y: right.y + (tileHeight / 2),
            },
            {
              x: bottom.x - (tileWidth / 2) + ((width - 1) * -(tileWidth / 2)),
              y: bottom.y - (tileHeight / 2) + ((width - 1) * -(tileHeight / 2)),
            },
            {
              x: left.x + ((width - 1) * -(tileWidth / 2)),
              y: left.y - (tileHeight) 
                + ((width - 1) * -(tileHeight / 2)) 
                + ((height - 1) * -tileHeight),
            },
          ]
          break;  
        }
      }

      const midPoint = this.getMidPoint(
        points[0].x,
        points[0].y,
        points[2].x,
        points[2].y,
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

      // this.renderTile(type, points, fill, stroke, opacity, debugMode);
      this.addTileForRendering(
        isoX,
        isoY,
        isoZ,
        { type, points, fill, stroke, opacity, debugMode },
      );
    } else {
      console.error(
        'Unable to render isometric tile. ' +
        'Please ensure that your co-ordinates are within bounds.'
      );
    }
  }

  addCuboidAt({
    isoX,
    isoY,
    isoZ,
    lengthX = 1,
    lengthY = 1,
    lengthZ = 1,
    fill = '#333333',
    stroke = 'transparent',
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

  renderTile({ type, points, fill, stroke, opacity, debugMode }) {
    const { context } = this;
    const { parse, offsetHSL } = color; 
    
    context.save();

    context.beginPath();

    context.lineWidth = 2;

    if (type === IsometricViewTileFaceType.BASE && debugMode) {        
      context.font = '12px Arial';
      context.fontStyle = 'bold';
      context.textAlign = 'center';
      context.textBaseline = 'middle';

      context.fillStyle = 'rgba(255, 255, 255, 0.7)';

      context.fillText(`${isoX}, ${isoY}`, center.x, center.y);

      context.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      context.fillStyle = 'rgba(255, 255, 255, 0.2)';
    } else {
      let renderedFill, color;

      if (fill !== 'transparent') {
        switch (type) {
          case IsometricViewTileFaceType.BASE:
          default: {
            color = parse(fill).rgb;
            break;
          }
          case IsometricViewTileFaceType.SIDE_RIGHT: {
            color = offsetHSL(fill, 0, 0, -5).rgb;
            break;
          }
          case IsometricViewTileFaceType.SIDE_LEFT: {
            color = offsetHSL(fill, 0, 0, 5).rgb;
            break;
          }
        }

        renderedFill = 
          `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`;
      } else {
        renderedFill = fill;
      }

      context.fillStyle = renderedFill;
      context.strokeStyle = stroke;
    }

    points.forEach((point, i) => {
      const { x, y } = point;
      
      if (i == 0) {
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

  render(withZCorrection = true) {
    const { isometricGrid } = this;
    
    const isometricGridPointsThatHaveRenderableTiles = 
      isometricGrid.flat(1).filter(
        (isometricGridTile) => isometricGridTile.tiles.length > 0,
      );
    
    if (withZCorrection) {
      // Rendering with z correction
      isometricGridPointsThatHaveRenderableTiles
      .map(({ tiles }) =>  tiles)
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