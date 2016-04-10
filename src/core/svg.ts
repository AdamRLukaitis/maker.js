namespace MakerJs.exporter {

    export function toSVG(modelToExport: IModel, options?: ISVGRenderOptions): string;
    export function toSVG(pathsToExport: IPath[], options?: ISVGRenderOptions): string;
    export function toSVG(pathToExport: IPath, options?: ISVGRenderOptions): string;

    /**
     * Renders an item in SVG markup.
     * 
     * @param itemToExport Item to render: may be a path, an array of paths, or a model object.
     * @param options Rendering options object.
     * @param options.annotate Boolean to indicate that the id's of paths should be rendered as SVG text elements.
     * @param options.origin point object for the rendered reference origin.
     * @param options.scale Number to scale the SVG rendering.
     * @param options.stroke String color of the rendered paths.
     * @param options.strokeWidth String numeric width and optional units of the rendered paths.
     * @param options.units String of the unit system. May be omitted. See makerjs.unitType for possible values.
     * @param options.useSvgPathOnly Boolean to use SVG path elements instead of line, circle etc.
     * @returns String of XML / SVG content.
     */
    export function toSVG(itemToExport: any, options?: ISVGRenderOptions): string {

        var opts: ISVGRenderOptions = {
            annotate: false,
            origin: null,
            scale: 1,
            stroke: "#000",
            strokeWidth: '0.25mm',   //a somewhat average kerf of a laser cutter
            fontSize: '9pt',
            useSvgPathOnly: true,
            viewBox: true
        };

        extendObject(opts, options);

        var modelToExport: IModel;
        var itemToExportIsModel = isModel(itemToExport);
        if (itemToExportIsModel) {
            modelToExport = itemToExport as IModel;

            if (modelToExport.exporterOptions) {
                extendObject(opts, modelToExport.exporterOptions['toSVG']);
            }
        }

        var elements: string[] = [];
        var layers: ILayerElements = {};

        function append(value: string, layer?: string) {
            if (layer) {

                if (!(layer in layers)) {
                    layers[layer] = [];
                }

                layers[layer].push(value);

            } else {
                elements.push(value);
            }
        }

        function fixPoint(pointToFix: IPoint): IPoint {
            //in DXF Y increases upward. in SVG, Y increases downward
            var pointMirroredY = point.mirror(pointToFix, false, true);
            return point.scale(pointMirroredY, opts.scale);
        }

        function fixPath(pathToFix: IPath, origin: IPoint): IPath {
            //mirror creates a copy, so we don't modify the original
            var mirrorY = path.mirror(pathToFix, false, true);
            return path.moveRelative(path.scale(mirrorY, opts.scale), origin);
        }

        function createElement(tagname: string, attrs: IXmlTagAttrs, layer: string, innerText: string = null) {

            attrs['vector-effect'] = 'non-scaling-stroke';

            var tag = new XmlTag(tagname, attrs);

            if (innerText) {
                tag.innerText = innerText;
            }

            append(tag.toString(), layer);
        }

        function drawText(id: string, textPoint: IPoint) {
            createElement(
                "text",
                {
                    "id": id + "_text",
                    "x": textPoint[0],
                    "y": textPoint[1]
                },
                null,
                id);
        }

        function drawPath(id: string, x: number, y: number, d: any[], layer: string, textPoint: IPoint) {
            createElement(
                "path",
                {
                    "id": id,
                    "d": ["M", round(x), round(y)].concat(d).join(" ")
                },
                layer);

            if (opts.annotate) {
                drawText(id, textPoint);
            }
        }

        var map: IPathOriginFunctionMap = {};

        map[pathType.Line] = function (id: string, line: IPathLine, origin: IPoint, layer: string) {

            var start = line.origin;
            var end = line.end;

            if (opts.useSvgPathOnly) {
                drawPath(id, start[0], start[1], [round(end[0]), round(end[1])], layer, point.middle(line));
            } else {
                createElement(
                    "line",
                    {
                        "id": id,
                        "x1": round(start[0]),
                        "y1": round(start[1]),
                        "x2": round(end[0]),
                        "y2": round(end[1])
                    },
                    layer);

                if (opts.annotate) {
                    drawText(id, point.middle(line));
                }
            }
        };

        map[pathType.Circle] = function (id: string, circle: IPathCircle, origin: IPoint, layer: string) {

            var center = circle.origin;

            if (opts.useSvgPathOnly) {

                circleInPaths(id, center, circle.radius, layer);

            } else {
                createElement(
                    "circle",
                    {
                        "id": id,
                        "r": circle.radius,
                        "cx": round(center[0]),
                        "cy": round(center[1])
                    },
                    layer);
            }

            if (opts.annotate) {
                drawText(id, center);
            }
        };

        function circleInPaths(id: string, center: IPoint, radius: number, layer: string) {
            var d = ['m', -radius, 0];

            function halfCircle(sign: number) {
                d.push('a');
                svgArcData(d, radius, [2 * radius * sign, 0]);
            }

            halfCircle(1);
            halfCircle(-1);

            drawPath(id, center[0], center[1], d, layer, center);
        }

        function svgArcData(d: any[], radius: number, endPoint: IPoint, largeArc?: boolean, decreasing?: boolean) {
            var end: IPoint = endPoint;
            d.push(radius, radius);
            d.push(0);                   //0 = x-axis rotation
            d.push(largeArc ? 1 : 0);    //large arc=1, small arc=0
            d.push(decreasing ? 0 : 1);  //sweep-flag 0=decreasing, 1=increasing 
            d.push(round(end[0]), round(end[1]));
        }

        map[pathType.Arc] = function (id: string, arc: IPathArc, origin: IPoint, layer: string) {

            var arcPoints = point.fromArc(arc);

            if (measure.isPointEqual(arcPoints[0], arcPoints[1])) {
                circleInPaths(id, arc.origin, arc.radius, layer);
            } else {

                var d = ['A'];
                svgArcData(
                    d,
                    arc.radius,
                    arcPoints[1],
                    Math.abs(arc.endAngle - arc.startAngle) > 180,
                    arc.startAngle > arc.endAngle
                    );

                drawPath(id, arcPoints[0][0], arcPoints[0][1], d, layer, point.middle(arc));
            }
        };

        map[pathType.Bezier] = function (id: string, bezier: IPathBezier, origin: IPoint, layer: string) {
            //TODO-BEZIER
        };

        //fixup options

        //measure the item to move it into svg area

        if (itemToExportIsModel) {
            modelToExport = <IModel>itemToExport;

        } else if (Array.isArray(itemToExport)) {
            //issue: this won't handle an array of models
            modelToExport = { paths: <IPathMap>itemToExport };

        } else if (isPath(itemToExport)) {
            modelToExport = { paths: {modelToMeasure: <IPath>itemToExport } };
        }

        var size = measure.modelExtents(modelToExport);

        //try to get the unit system from the itemToExport
        if (!opts.units) {
            var unitSystem = tryGetModelUnits(itemToExport);
            if (unitSystem) {
                opts.units = unitSystem;
            }
        }

        //convert unit system (if it exists) into SVG's units. scale if necessary.
        var useSvgUnit = svgUnit[opts.units];
        if (useSvgUnit && opts.viewBox) {
            opts.scale *= useSvgUnit.scaleConversion;
        }

        if (!opts.origin) {
            var left = 0;
            if (size.low[0] < 0) {
                left = -size.low[0] * opts.scale;
            }
            opts.origin = [left, size.high[1] * opts.scale];
        }

        //also pass back to options parameter
        extendObject(options, opts);

        //begin svg output

        var modelGroup = new XmlTag('g');

        function beginModel(id: string, modelContext: IModel) {
            modelGroup.attrs = { id: id };
            append(modelGroup.getOpeningTag(false), modelContext.layer);
        }

        function endModel(modelContext: IModel) {
            append(modelGroup.getClosingTag(), modelContext.layer);
        }

        var svgAttrs: IXmlTagAttrs;

        if (opts.viewBox) {
            var width = round(size.high[0] - size.low[0]) * opts.scale;
            var height = round(size.high[1] - size.low[1]) * opts.scale;
            var viewBox = [0, 0, width, height];

            var unit = useSvgUnit ? useSvgUnit.svgUnitType : '';

            svgAttrs = {
                width: width + unit,
                height: height + unit,
                viewBox: viewBox.join(' ')
            };
        }

        var svgTag = new XmlTag('svg', <IXmlTagAttrs>extendObject(svgAttrs || {}, opts.svgAttrs));

        append(svgTag.getOpeningTag(false));

        var svgGroup = new XmlTag('g', {
            id: 'svgGroup',
            stroke: opts.stroke,
            "stroke-width": opts.strokeWidth,
            "stroke-linecap": "round",
            "fill": "none",
            "font-size": opts.fontSize
        });
        append(svgGroup.getOpeningTag(false));

        var exp = new Exporter(map, fixPoint, fixPath, beginModel, endModel);
        exp.exportItem('0', itemToExport, opts.origin);

        //export layers as groups
        for (var layer in layers) {

            var layerGroup = new XmlTag('g', { id: layer });

            for (var i = 0; i < layers[layer].length; i++) {
                layerGroup.innerText += layers[layer][i];
            }

            layerGroup.innerTextEscaped = true;
            append(layerGroup.toString());
        }

        append(svgGroup.getClosingTag());
        append(svgTag.getClosingTag());

        return elements.join('');
    }

    /**
     * Map of MakerJs unit system to SVG unit system
     */
    export interface svgUnitConversion {
        [unitType: string]: { svgUnitType: string; scaleConversion: number; };
    }

    interface ILayerElements {
        [id: string]: string[];
    }

    /**
     * Map of MakerJs unit system to SVG unit system
     */
    export var svgUnit: svgUnitConversion = {};

    //SVG Coordinate Systems, Transformations and Units documentation:
    //http://www.w3.org/TR/SVG/coords.html
    //The supported length unit identifiers are: em, ex, px, pt, pc, cm, mm, in, and percentages.

    svgUnit[unitType.Inch] = { svgUnitType: "in", scaleConversion: 1 };
    svgUnit[unitType.Millimeter] = { svgUnitType: "mm", scaleConversion: 1 };
    svgUnit[unitType.Centimeter] = { svgUnitType: "cm", scaleConversion: 1 };

    //Add conversions for all unitTypes
    svgUnit[unitType.Foot] = { svgUnitType: "in", scaleConversion: 12 };
    svgUnit[unitType.Meter] = { svgUnitType: "cm", scaleConversion: 100 };

    /**
     * SVG rendering options.
     */
    export interface ISVGRenderOptions extends IExportOptions {

        /**
         * Optional attributes to add to the root svg tag.
         */
        svgAttrs?: IXmlTagAttrs;

        /**
         * SVG font size and font size units.
         */
        fontSize?: string;

        /**
         * SVG stroke width of paths. This may have a unit type suffix, if not, the value will be in the same unit system as the units property.
         */
        strokeWidth?: string;

        /**
         * SVG color of the rendered paths.
         */
        stroke?: string;

        /**
         * Scale of the SVG rendering.
         */
        scale?: number;

        /**
         *  Indicate that the id's of paths should be rendered as SVG text elements.
         */
        annotate?: boolean;

        /**
         * Rendered reference origin. 
         */
        origin?: IPoint;

        /**
         * Use SVG < path > elements instead of < line >, < circle > etc.
         */
        useSvgPathOnly?: boolean;

        /**
         * Flag to use SVG viewbox. 
         */
        viewBox?: boolean;
    }

}
