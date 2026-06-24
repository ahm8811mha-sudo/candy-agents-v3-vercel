import Foundation

struct AgentService {
    func execute(_ payload: AgentRequest, baseURL: String) async throws -> AgentPipelineResponse {
        let trimmedURL = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedURL.isEmpty else {
            return demoResponse(for: payload)
        }

        guard let root = URL(string: trimmedURL), root.scheme?.hasPrefix("http") == true else {
            throw URLError(.badURL)
        }

        let endpoint = root.appending(path: "api/agents/pipeline")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(payload)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let decoded = try? JSONDecoder().decode(AgentPipelineResponse.self, from: data)
            throw ServiceError.server(decoded?.message ?? "تعذر تنفيذ الطلب من الخادم.")
        }

        return try JSONDecoder().decode(AgentPipelineResponse.self, from: data)
    }

    private func demoResponse(for payload: AgentRequest) -> AgentPipelineResponse {
        let employees = [
            EmployeeResult(name: "موظف التحليل", role: "فهم الطلب", output: "تم تحليل الطلب وتحديد أن المطلوب هو تحويله إلى خطة تنفيذية واضحة قابلة للمتابعة."),
            EmployeeResult(name: "موظف الفرص", role: "ترتيب الإجراءات", output: "أفضل إجراء الآن هو ضبط التشغيل الداخلي ثم ربطه بمهام ومسؤوليات ومؤشرات أسبوعية."),
            EmployeeResult(name: "موظف القرار", role: "اعتماد المسار", output: "القرار المعتمد: تنفيذ خطة 90 يومًا تبدأ بتشخيص الشركة ثم توزيع المهام ومتابعة النتائج."),
            EmployeeResult(name: "موظف التنفيذ", role: "تسليم الخطة", output: "المهام: جمع البيانات، تحديد الأولويات، توزيع المسؤوليات، مراجعة أسبوعية، وتسليم تقرير تنفيذي.")
        ]

        let final = """
        تم تنفيذ الطلب

        الطلب:
        \(payload.request)

        النتيجة:
        - تم فهم الطلب وتحويله إلى مسار عمل.
        - تم تحديد الأولوية: بناء خطة تشغيل قابلة للتنفيذ.
        - تم تحديد الموظفين المطلوبين: تحليل، فرص، قرار، تنفيذ.
        - مدة التنفيذ المقترحة: \(payload.timeframe).
        - الميزانية التقريبية: \(Int(payload.budget)).

        الخطوة التالية:
        ضع رابط Vercel في خانة رابط الخدمة لتفعيل التنفيذ الحقيقي عبر API.
        """

        return AgentPipelineResponse(ok: true, runId: "demo", finalResult: final, employees: employees, saved: false, message: nil)
    }
}

enum ServiceError: LocalizedError {
    case server(String)

    var errorDescription: String? {
        switch self {
        case .server(let message): message
        }
    }
}
