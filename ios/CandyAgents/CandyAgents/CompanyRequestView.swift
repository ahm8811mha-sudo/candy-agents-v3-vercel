import SwiftUI

struct CompanyRequestView: View {
    @AppStorage("agentBaseURL") private var baseURL = ""
    @State private var requestText = "احصر الوضع الحالي للشركة من ناحية كل شيء، ثم قدم خطة عمل تنفيذية جاهزة تشمل المهام والأدوار والجدول الزمني والمخاطر."
    @State private var market = "شركة تجارة وخدمات في السعودية"
    @State private var budget = "50000"
    @State private var timeframe = "90 يومًا"
    @State private var state: RequestState = .idle
    @State private var response: AgentPipelineResponse?

    private let service = AgentService()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    requestCard
                    employeesCard
                    deliveryCard
                }
                .padding(18)
            }
            .background(Color.appBackground)
            .navigationTitle("Candy Agents")
            .navigationBarTitleDisplayMode(.inline)
        }
        .environment(\.layoutDirection, .rightToLeft)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("شركة موظفين ذكاء اصطناعي", systemImage: "sparkles")
                .font(.footnote.weight(.bold))
                .foregroundStyle(.cyan)

            Text("اكتب طلبك مرة واحدة، والموظفون ينفذونه ويرجعون لك التسليم كاملًا")
                .font(.system(size: 30, weight: .bold))
                .lineSpacing(4)

            Text("التطبيق يركز على الإجراء الأساسي: طلب واحد، تنفيذ داخلي، نتيجة واحدة واضحة.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private var requestCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("الطلب")
                .font(.headline)

            TextField("رابط خدمة Vercel اختياري", text: $baseURL)
                .textInputAutocapitalization(.never)
                .keyboardType(.URL)
                .autocorrectionDisabled()
                .fieldStyle()

            TextEditor(text: $requestText)
                .frame(minHeight: 170)
                .fieldStyle()

            TextField("مجال الشركة", text: $market)
                .fieldStyle()

            HStack(spacing: 10) {
                TextField("الميزانية", text: $budget)
                    .keyboardType(.numberPad)
                    .fieldStyle()

                TextField("المدة", text: $timeframe)
                    .fieldStyle()
            }

            Button(action: runRequest) {
                HStack {
                    if case .running = state {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "paperplane.fill")
                    }
                    Text(buttonTitle)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(requestText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || state == .running)

            if case .failed(let message) = state {
                Text(message)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.red)
                    .padding(.top, 4)
            }
        }
        .cardStyle()
    }

    private var employeesCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("الموظفون")
                .font(.headline)

            ForEach(employeeRows, id: \.name) { employee in
                HStack(spacing: 12) {
                    Image(systemName: employee.icon)
                        .frame(width: 30, height: 30)
                        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(employee.name)
                            .font(.subheadline.weight(.bold))
                        Text(employee.role)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    if state == .running {
                        ProgressView()
                    } else if state == .delivered {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                }
            }
        }
        .cardStyle()
    }

    private var deliveryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("التسليم النهائي")
                    .font(.headline)
                Spacer()
                statusLabel
            }

            if let finalResult = response?.finalResult {
                Text(finalResult)
                    .font(.body)
                    .lineSpacing(5)
                    .textSelection(.enabled)

                if let employees = response?.employees, !employees.isEmpty {
                    DisclosureGroup("تفاصيل عمل الموظفين") {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(employees) { employee in
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(employee.name)
                                        .font(.subheadline.weight(.bold))
                                    Text(employee.output)
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                        .textSelection(.enabled)
                                }
                                .padding(.vertical, 6)
                            }
                        }
                        .padding(.top, 8)
                    }
                }
            } else {
                ContentUnavailableView(
                    "لا توجد نتيجة بعد",
                    systemImage: "briefcase",
                    description: Text("اكتب الطلب واضغط تنفيذ. ستظهر النتيجة الكاملة هنا.")
                )
                .frame(maxWidth: .infinity)
                .padding(.vertical, 28)
            }
        }
        .cardStyle()
    }

    private var statusLabel: some View {
        Group {
            switch state {
            case .idle:
                Text("بانتظار الطلب")
                    .foregroundStyle(.secondary)
            case .running:
                Text("قيد التنفيذ")
                    .foregroundStyle(.orange)
            case .delivered:
                Text("تم التسليم")
                    .foregroundStyle(.green)
            case .failed:
                Text("تعذر التنفيذ")
                    .foregroundStyle(.red)
            }
        }
        .font(.caption.weight(.bold))
    }

    private var buttonTitle: String {
        state == .running ? "الموظفون ينفذون الطلب" : "تنفيذ الطلب"
    }

    private var employeeRows: [(name: String, role: String, icon: String)] {
        [
            ("موظف التحليل", "يفهم الطلب والوضع الحالي", "chart.line.uptrend.xyaxis"),
            ("موظف الفرص", "يرتب أفضل الإجراءات", "target"),
            ("موظف القرار", "يعتمد المسار المناسب", "checkmark.seal"),
            ("موظف التنفيذ", "يرجع خطة العمل كاملة", "list.clipboard")
        ]
    }

    private func runRequest() {
        state = .running
        response = nil

        let payload = AgentRequest(
            request: requestText,
            market: market,
            budget: Double(budget) ?? 0,
            timeframe: timeframe
        )

        Task {
            do {
                let result = try await service.execute(payload, baseURL: baseURL)
                await MainActor.run {
                    response = result
                    state = result.ok ? .delivered : .failed(result.message ?? "تعذر تنفيذ الطلب.")
                }
            } catch {
                await MainActor.run {
                    state = .failed(error.localizedDescription)
                }
            }
        }
    }
}

private extension View {
    func cardStyle() -> some View {
        self
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.cardBackground, in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
    }

    func fieldStyle() -> some View {
        self
            .padding(12)
            .background(Color.inputBackground, in: RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
    }
}

private extension Color {
    static let appBackground = Color(red: 0.05, green: 0.07, blue: 0.10)
    static let cardBackground = Color(red: 0.09, green: 0.12, blue: 0.17)
    static let inputBackground = Color(red: 0.06, green: 0.09, blue: 0.13)
}

#Preview {
    CompanyRequestView()
}
