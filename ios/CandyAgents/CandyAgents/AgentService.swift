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

        let endpoint = root.appending(path: "api/company")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["request": payload.request])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let decoded = try? JSONDecoder().decode(CompanyResponse.self, from: data)
            throw ServiceError.server(decoded?.error ?? "تعذر تنفيذ الطلب من الخادم.")
        }

        let company = try JSONDecoder().decode(CompanyResponse.self, from: data)
        return mapCompanyResponse(company)
    }

    private func demoResponse(for payload: AgentRequest) -> AgentPipelineResponse {
        let employees = [
            EmployeeResult(name: "الإدارة المالية", role: "الميزانية والعائد", output: "تقسيم الميزانية على الإطلاق، التسويق، التشغيل، الاحتياطي، وقياس العائد."),
            EmployeeResult(name: "إدارة التسويق", role: "السوق والنمو", output: "تحديد الجمهور المستهدف، عرض الإطلاق، قنوات التسويق، ومؤشرات الأداء."),
            EmployeeResult(name: "إدارة العمليات", role: "التنفيذ والموارد", output: "تحويل الطلب إلى مهام أسبوعية، مسؤولين، مخرجات، ومراجعات."),
            EmployeeResult(name: "سلسلة الإمداد", role: "المخزون والموردون", output: "اختيار الموردين، ضبط المخزون، اللوجستيات، ومخاطر التوريد."),
            EmployeeResult(name: "الرئيس التنفيذي", role: "القرار النهائي", output: "البدء بإطلاق تجريبي مضبوط قبل التوسع الكامل.")
        ]

        let final = """
        تقرير الشركة التنفيذي

        الطلب:
        \(payload.request)

        النتيجة:
        - الإدارة المالية جهزت تصور الميزانية والمخاطر.
        - التسويق حدد الجمهور والقنوات ومؤشرات الأداء.
        - العمليات حولت الطلب إلى خطة تنفيذ.
        - سلسلة الإمداد وضعت تصور الموردين والمخزون.
        - الرئيس التنفيذي اعتمد إطلاقًا تجريبيًا مضبوطًا.
        - مدة التنفيذ المقترحة: \(payload.timeframe).
        - الميزانية التقريبية: \(Int(payload.budget)).

        الخطوة التالية:
        ضع رابط Vercel في خانة رابط الخدمة لتفعيل التنفيذ الحقيقي عبر API.
        """

        return AgentPipelineResponse(ok: true, runId: "demo", finalResult: final, employees: employees, saved: false, message: nil)
    }

    private func mapCompanyResponse(_ response: CompanyResponse) -> AgentPipelineResponse {
        let employees = [
            EmployeeResult(name: "الإدارة المالية", role: "المحاسبة والميزانية", output: response.accounting ?? ""),
            EmployeeResult(name: "إدارة التسويق", role: "السوق والنمو", output: response.marketing ?? ""),
            EmployeeResult(name: "إدارة العمليات", role: "التنفيذ والموارد", output: response.operations ?? ""),
            EmployeeResult(name: "سلسلة الإمداد", role: "المخزون والموردون", output: response.supplyChain ?? ""),
            EmployeeResult(name: "الرئيس التنفيذي", role: "القرار النهائي", output: response.decision ?? "")
        ]

        let final = """
        تقرير الشركة التنفيذي

        الطلب:
        \(response.request ?? "")

        قرار الرئيس التنفيذي:
        \(response.decision ?? "")

        التقرير المالي:
        \(response.accounting ?? "")

        تقرير التسويق:
        \(response.marketing ?? "")

        تقرير العمليات:
        \(response.operations ?? "")

        تقرير سلسلة الإمداد:
        \(response.supplyChain ?? "")
        """

        return AgentPipelineResponse(ok: response.ok, runId: "company", finalResult: final, employees: employees, saved: response.saved, message: response.error)
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
