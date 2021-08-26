/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { dashCaseToCamelCase } from '../../util';
import { AnimationStyleNormalizer } from './animation_style_normalizer';
export class WebAnimationsStyleNormalizer extends AnimationStyleNormalizer {
    normalizePropertyName(propertyName, errors) {
        return dashCaseToCamelCase(propertyName);
    }
    normalizeStyleValue(userProvidedProperty, normalizedProperty, value, errors) {
        let unit = '';
        const strVal = value.toString().trim();
        if (DIMENSIONAL_PROP_MAP[normalizedProperty] && value !== 0 && value !== '0') {
            if (typeof value === 'number') {
                unit = 'px';
            }
            else {
                const valAndSuffixMatch = value.match(/^[+-]?[\d\.]+([a-z]*)$/);
                if (valAndSuffixMatch && valAndSuffixMatch[1].length == 0) {
                    errors.push(`Please provide a CSS unit value for ${userProvidedProperty}:${value}`);
                }
            }
        }
        return strVal + unit;
    }
}
const ɵ0 = () => makeBooleanMap('width,height,minWidth,minHeight,maxWidth,maxHeight,left,top,bottom,right,fontSize,outlineWidth,outlineOffset,paddingTop,paddingLeft,paddingBottom,paddingRight,marginTop,marginLeft,marginBottom,marginRight,borderRadius,borderWidth,borderTopWidth,borderLeftWidth,borderRightWidth,borderBottomWidth,textIndent,perspective'
    .split(','));
const DIMENSIONAL_PROP_MAP = (ɵ0)();
function makeBooleanMap(keys) {
    const map = {};
    keys.forEach(key => map[key] = true);
    return map;
}
export { ɵ0 };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViX2FuaW1hdGlvbnNfc3R5bGVfbm9ybWFsaXplci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuaW1hdGlvbnMvYnJvd3Nlci9zcmMvZHNsL3N0eWxlX25vcm1hbGl6YXRpb24vd2ViX2FuaW1hdGlvbnNfc3R5bGVfbm9ybWFsaXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFDSCxPQUFPLEVBQUMsbUJBQW1CLEVBQUMsTUFBTSxZQUFZLENBQUM7QUFFL0MsT0FBTyxFQUFDLHdCQUF3QixFQUFDLE1BQU0sOEJBQThCLENBQUM7QUFFdEUsTUFBTSxPQUFPLDRCQUE2QixTQUFRLHdCQUF3QjtJQUMvRCxxQkFBcUIsQ0FBQyxZQUFvQixFQUFFLE1BQWdCO1FBQ25FLE9BQU8sbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUVRLG1CQUFtQixDQUN4QixvQkFBNEIsRUFBRSxrQkFBMEIsRUFBRSxLQUFvQixFQUM5RSxNQUFnQjtRQUNsQixJQUFJLElBQUksR0FBVyxFQUFFLENBQUM7UUFDdEIsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO1FBRXZDLElBQUksb0JBQW9CLENBQUMsa0JBQWtCLENBQUMsSUFBSSxLQUFLLEtBQUssQ0FBQyxJQUFJLEtBQUssS0FBSyxHQUFHLEVBQUU7WUFDNUUsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLEVBQUU7Z0JBQzdCLElBQUksR0FBRyxJQUFJLENBQUM7YUFDYjtpQkFBTTtnQkFDTCxNQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQztnQkFDaEUsSUFBSSxpQkFBaUIsSUFBSSxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFO29CQUN6RCxNQUFNLENBQUMsSUFBSSxDQUFDLHVDQUF1QyxvQkFBb0IsSUFBSSxLQUFLLEVBQUUsQ0FBQyxDQUFDO2lCQUNyRjthQUNGO1NBQ0Y7UUFDRCxPQUFPLE1BQU0sR0FBRyxJQUFJLENBQUM7SUFDdkIsQ0FBQztDQUNGO1dBR0ksR0FBRyxFQUFFLENBQUMsY0FBYyxDQUNoQixnVUFBZ1U7S0FDM1QsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBSHpCLE1BQU0sb0JBQW9CLEdBQ3RCLElBRXNCLEVBQUUsQ0FBQztBQUU3QixTQUFTLGNBQWMsQ0FBQyxJQUFjO0lBQ3BDLE1BQU0sR0FBRyxHQUE2QixFQUFFLENBQUM7SUFDekMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztJQUNyQyxPQUFPLEdBQUcsQ0FBQztBQUNiLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cbmltcG9ydCB7ZGFzaENhc2VUb0NhbWVsQ2FzZX0gZnJvbSAnLi4vLi4vdXRpbCc7XG5cbmltcG9ydCB7QW5pbWF0aW9uU3R5bGVOb3JtYWxpemVyfSBmcm9tICcuL2FuaW1hdGlvbl9zdHlsZV9ub3JtYWxpemVyJztcblxuZXhwb3J0IGNsYXNzIFdlYkFuaW1hdGlvbnNTdHlsZU5vcm1hbGl6ZXIgZXh0ZW5kcyBBbmltYXRpb25TdHlsZU5vcm1hbGl6ZXIge1xuICBvdmVycmlkZSBub3JtYWxpemVQcm9wZXJ0eU5hbWUocHJvcGVydHlOYW1lOiBzdHJpbmcsIGVycm9yczogc3RyaW5nW10pOiBzdHJpbmcge1xuICAgIHJldHVybiBkYXNoQ2FzZVRvQ2FtZWxDYXNlKHByb3BlcnR5TmFtZSk7XG4gIH1cblxuICBvdmVycmlkZSBub3JtYWxpemVTdHlsZVZhbHVlKFxuICAgICAgdXNlclByb3ZpZGVkUHJvcGVydHk6IHN0cmluZywgbm9ybWFsaXplZFByb3BlcnR5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmd8bnVtYmVyLFxuICAgICAgZXJyb3JzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG4gICAgbGV0IHVuaXQ6IHN0cmluZyA9ICcnO1xuICAgIGNvbnN0IHN0clZhbCA9IHZhbHVlLnRvU3RyaW5nKCkudHJpbSgpO1xuXG4gICAgaWYgKERJTUVOU0lPTkFMX1BST1BfTUFQW25vcm1hbGl6ZWRQcm9wZXJ0eV0gJiYgdmFsdWUgIT09IDAgJiYgdmFsdWUgIT09ICcwJykge1xuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgdW5pdCA9ICdweCc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCB2YWxBbmRTdWZmaXhNYXRjaCA9IHZhbHVlLm1hdGNoKC9eWystXT9bXFxkXFwuXSsoW2Etel0qKSQvKTtcbiAgICAgICAgaWYgKHZhbEFuZFN1ZmZpeE1hdGNoICYmIHZhbEFuZFN1ZmZpeE1hdGNoWzFdLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgZXJyb3JzLnB1c2goYFBsZWFzZSBwcm92aWRlIGEgQ1NTIHVuaXQgdmFsdWUgZm9yICR7dXNlclByb3ZpZGVkUHJvcGVydHl9OiR7dmFsdWV9YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN0clZhbCArIHVuaXQ7XG4gIH1cbn1cblxuY29uc3QgRElNRU5TSU9OQUxfUFJPUF9NQVAgPVxuICAgICgoKSA9PiBtYWtlQm9vbGVhbk1hcChcbiAgICAgICAgICd3aWR0aCxoZWlnaHQsbWluV2lkdGgsbWluSGVpZ2h0LG1heFdpZHRoLG1heEhlaWdodCxsZWZ0LHRvcCxib3R0b20scmlnaHQsZm9udFNpemUsb3V0bGluZVdpZHRoLG91dGxpbmVPZmZzZXQscGFkZGluZ1RvcCxwYWRkaW5nTGVmdCxwYWRkaW5nQm90dG9tLHBhZGRpbmdSaWdodCxtYXJnaW5Ub3AsbWFyZ2luTGVmdCxtYXJnaW5Cb3R0b20sbWFyZ2luUmlnaHQsYm9yZGVyUmFkaXVzLGJvcmRlcldpZHRoLGJvcmRlclRvcFdpZHRoLGJvcmRlckxlZnRXaWR0aCxib3JkZXJSaWdodFdpZHRoLGJvcmRlckJvdHRvbVdpZHRoLHRleHRJbmRlbnQscGVyc3BlY3RpdmUnXG4gICAgICAgICAgICAgLnNwbGl0KCcsJykpKSgpO1xuXG5mdW5jdGlvbiBtYWtlQm9vbGVhbk1hcChrZXlzOiBzdHJpbmdbXSk6IHtba2V5OiBzdHJpbmddOiBib29sZWFufSB7XG4gIGNvbnN0IG1hcDoge1trZXk6IHN0cmluZ106IGJvb2xlYW59ID0ge307XG4gIGtleXMuZm9yRWFjaChrZXkgPT4gbWFwW2tleV0gPSB0cnVlKTtcbiAgcmV0dXJuIG1hcDtcbn1cbiJdfQ==