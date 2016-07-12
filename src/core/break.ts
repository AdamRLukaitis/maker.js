﻿namespace MakerJs.path {

    /**
     * @private
     */
    interface IBreakPathFunctionMap {
        [type: string]: (path: IPath, pointOfBreak: IPoint, angleOfBreak?: number, tOfBreak?: number) => IPath;
    }

    /**
     * @private
     */
    var breakPathFunctionMap: IBreakPathFunctionMap = {};

    breakPathFunctionMap[pathType.Arc] = function (arc: IPathArc, pointOfBreak: IPoint, angleOfBreak?: number, tOfBreak?: number): IPath {

        var angleAtBreakPoint = angleOfBreak || angle.ofPointInDegrees(arc.origin, pointOfBreak);

        if (measure.isAngleEqual(angleAtBreakPoint, arc.startAngle) || measure.isAngleEqual(angleAtBreakPoint, arc.endAngle)) {
            return null;
        }

        function getAngleStrictlyBetweenArcAngles() {
            var startAngle = angle.noRevolutions(arc.startAngle);
            var endAngle = startAngle + angle.ofArcEnd(arc) - arc.startAngle;

            var tries = [0, 1, -1];
            for (var i = 0; i < tries.length; i++) {
                var add = + 360 * tries[i];
                if (measure.isBetween(angleAtBreakPoint + add, startAngle, endAngle, true)) {
                    return arc.startAngle + angleAtBreakPoint + add - startAngle;
                }
            }
            return null;
        }

        var angleAtBreakPointBetween = getAngleStrictlyBetweenArcAngles();
        if (angleAtBreakPointBetween === null) {
            return null;
        }

        var savedEndAngle = arc.endAngle;

        arc.endAngle = angleAtBreakPointBetween;

        return new paths.Arc(arc.origin, arc.radius, angleAtBreakPointBetween, savedEndAngle);
    };

    breakPathFunctionMap[pathType.Circle] = function (circle: IPathCircle, pointOfBreak: IPoint, angleOfBreak?: number, tOfBreak?: number): IPath {
        circle.type = pathType.Arc;

        var arc: IPathArc = <IPathArc>circle;

        var angleAtBreakPoint = angle.ofPointInDegrees(circle.origin, pointOfBreak);

        arc.startAngle = angleAtBreakPoint;
        arc.endAngle = angleAtBreakPoint + 360;

        return null;
    };

    breakPathFunctionMap[pathType.Line] = function (line: IPathLine, pointOfBreak: IPoint, angleOfBreak?: number, tOfBreak?: number): IPath {

        if (!measure.isBetweenPoints(pointOfBreak, line, true)) {
            return null;
        }

        var savedEndPoint = line.end;

        line.end = pointOfBreak;

        return new paths.Line(pointOfBreak, savedEndPoint);
    };

    breakPathFunctionMap[pathType.Bezier] = function (bez: IPathBezier, pointOfBreak: IPoint, angleOfBreak?: number, tOfBreak?: number): IPath {
        return bezier.breakAt(bez, tOfBreak);
    };

    /**
     * Breaks a path in two. The supplied path will end at the supplied pointOfBreak, 
     * a new path is returned which begins at the pointOfBreak and ends at the supplied path's initial end point.
     * For Circle, the original path will be converted in place to an Arc, and null is returned.
     * 
     * @param pathToBreak The path to break.
     * @param pointOfBreak The point at which to break the path.
     * @returns A new path of the same type, when path type is line or arc. Returns null for circle.
     */
    export function breakAtPoint(pathToBreak: IPath, pointOfBreak: IPoint, angleOfBreak?: number, tOfBreak?: number): IPath {
        if (pathToBreak && pointOfBreak) {
            var fn = breakPathFunctionMap[pathToBreak.type];
            if (fn) {
                var result = fn(pathToBreak, pointOfBreak, angleOfBreak, tOfBreak);

                if (result && ('layer' in pathToBreak)) {
                    result.layer = pathToBreak.layer;
                }

                return result;
            }
        }
        return null;
    }

}
