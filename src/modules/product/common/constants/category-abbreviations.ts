export const CATEGORY_ABBREVIATIONS: Record<string, string> = {
  '螺栓': 'BLT', '螺钉': 'LD', '螺母': 'NUT', '垫圈': 'DQ', '牙条': 'YT', '丝杆': 'SG',
};

export function getCategoryAbbreviation(name: string): string {
  return CATEGORY_ABBREVIATIONS[name] || name.substring(0, 3).toUpperCase();
}
