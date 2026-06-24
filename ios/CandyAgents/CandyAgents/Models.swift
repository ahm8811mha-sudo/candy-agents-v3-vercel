import Foundation

struct AgentRequest: Codable {
    var request: String
    var market: String
    var budget: Double
    var timeframe: String
}

struct EmployeeResult: Codable, Identifiable {
    var id: String { name }
    let name: String
    let role: String
    let output: String
}

struct AgentPipelineResponse: Codable {
    let ok: Bool
    let runId: String?
    let finalResult: String?
    let employees: [EmployeeResult]?
    let saved: Bool?
    let message: String?
}

struct CompanyResponse: Codable {
    let ok: Bool
    let request: String?
    let accounting: String?
    let marketing: String?
    let operations: String?
    let supplyChain: String?
    let decision: String?
    let saved: Bool?
    let error: String?
}

enum RequestState: Equatable {
    case idle
    case running
    case delivered
    case failed(String)
}
