export const PHYSIO = "PHYSIO";
export const GASTRO = "GASTRO";
export const UNKNOWN = "UNKNOWN";

/**
 * يقرر إلى أي ملف إكسل تذهب المعاملة.
 * يرجح القسم المذكور في المعاملة على بقية النص، لأن كلمة مثل "المعدة"
 * قد ترد عرضا في تشخيص مريض علاج طبيعي.
 */
export function classify(record, rawText, keywords) {
  const weighted = [
    { text: record.department, weight: 3 },
    { text: record.requestType, weight: 2 },
    { text: record.diagnosis, weight: 2 },
    { text: rawText, weight: 1 },
  ];

  let physioScore = 0;
  let gastroScore = 0;
  const hits = [];

  for (const { text, weight } of weighted) {
    const haystack = String(text || "").toLowerCase();
    if (!haystack) continue;

    for (const word of keywords.physiotherapy) {
      if (haystack.includes(String(word).toLowerCase())) {
        physioScore += weight;
        hits.push(word);
      }
    }
    for (const word of keywords.gastro) {
      if (haystack.includes(String(word).toLowerCase())) {
        gastroScore += weight;
        hits.push(word);
      }
    }
  }

  if (physioScore === 0 && gastroScore === 0) {
    return { category: UNKNOWN, physioScore, gastroScore, hits: [] };
  }
  if (physioScore === gastroScore) {
    return { category: UNKNOWN, physioScore, gastroScore, hits };
  }

  return {
    category: physioScore > gastroScore ? PHYSIO : GASTRO,
    physioScore,
    gastroScore,
    hits: [...new Set(hits)],
  };
}

export function categoryLabel(category) {
  if (category === PHYSIO) return "العلاج الطبيعي";
  if (category === GASTRO) return "الجهاز الهضمي";
  return "غير مصنف";
}
