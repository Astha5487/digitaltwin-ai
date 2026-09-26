from __future__ import annotations

from typing import Any

from nat.plugin_api import register_function, FunctionInfo
from nat.data_models.function import EmptyFunctionConfig, FunctionBaseConfig
from nat.builder.workflow_builder import WorkflowBuilder
from pydantic import BaseModel

from .state import twin, documents, DOC_CATEGORIES, SCENARIOS


# ---------- NAT config types ----------

class GetTwinSnapshotConfig(EmptyFunctionConfig, name="GetTwinSnapshotConfig"):
    pass


class GetEvidenceOptionsConfig(EmptyFunctionConfig, name="GetEvidenceOptionsConfig"):
    pass


class CollectEvidenceConfig(EmptyFunctionConfig, name="CollectEvidenceConfig"):
    pass


class GetCausesConfig(EmptyFunctionConfig, name="GetCausesConfig"):
    pass


class GetScenariosConfig(EmptyFunctionConfig, name="GetScenariosConfig"):
    pass


class MakeDecisionConfig(EmptyFunctionConfig, name="MakeDecisionConfig"):
    pass


class GetOutcomeConfig(EmptyFunctionConfig, name="GetOutcomeConfig"):
    pass


class ListDocumentsConfig(EmptyFunctionConfig, name="ListDocumentsConfig"):
    pass

class DigitalTwinOrchestratorConfig(FunctionBaseConfig, name="DigitalTwinOrchestratorConfig"):
    pass

class MonitoringAgentConfig(FunctionBaseConfig, name="MonitoringAgentConfig"):
    pass


class EvidenceAgentConfig(FunctionBaseConfig, name="EvidenceAgentConfig"):
    pass


class RootCauseAgentConfig(FunctionBaseConfig, name="RootCauseAgentConfig"):
    pass


class SimulationAgentConfig(FunctionBaseConfig, name="SimulationAgentConfig"):
    pass

class DecisionAgentConfig(FunctionBaseConfig, name="DecisionAgentConfig"):
    pass

class LearningAgentConfig(FunctionBaseConfig, name="LearningAgentConfig"):
    pass
# ---------- Input schemas ----------

class EvidenceInput(BaseModel):
    evidence_id: str


class DecisionInput(BaseModel):
    scenario_id: str
    verdict: str


# ---------- NAT functions ----------

async def snapshot_fn(_: None) -> dict[str, Any]:
    return twin.snapshot()


@register_function(GetTwinSnapshotConfig)
async def get_twin_snapshot(config, builder):
    yield FunctionInfo.from_fn(
        snapshot_fn,
        description="Get the current digital twin simulation state.",
    )


async def evidence_options_fn(_: None) -> list[dict[str, Any]]:
    return twin.evidence_options()


@register_function(GetEvidenceOptionsConfig)
async def get_evidence_options(config, builder):
    yield FunctionInfo.from_fn(
        evidence_options_fn,
        description="Get the available evidence sources for the current incident.",
    )


async def collect_evidence_fn(data: EvidenceInput) -> dict[str, Any]:
    return twin.collect(data.evidence_id)


@register_function(CollectEvidenceConfig)
async def collect_evidence(config, builder):
    yield FunctionInfo.from_fn(
        collect_evidence_fn,
        description="Collect a selected evidence source from the digital twin.",
    )


async def causes_fn(_: None) -> list[dict[str, Any]]:
    return twin.causes()


@register_function(GetCausesConfig)
async def get_causes(config, builder):
    yield FunctionInfo.from_fn(
        causes_fn,
        description="Analyze the current incident and return ranked root-cause evidence.",
    )


async def scenarios_fn(_: None) -> list[dict[str, Any]]:
    return SCENARIOS


@register_function(GetScenariosConfig)
async def get_scenarios(config, builder):
    yield FunctionInfo.from_fn(
        scenarios_fn,
        description="Get the available what-if intervention scenarios.",
    )


async def make_decision_fn(data: DecisionInput) -> dict[str, Any]:
    return twin.decide(data.scenario_id, data.verdict)


@register_function(MakeDecisionConfig)
async def make_decision(config, builder):
    yield FunctionInfo.from_fn(
        make_decision_fn,
        description="Record a human-approved or rejected intervention decision.",
    )


async def outcome_fn(_: None) -> dict[str, Any]:
    return twin.outcome()


@register_function(GetOutcomeConfig)
async def get_outcome(config, builder):
    yield FunctionInfo.from_fn(
        outcome_fn,
        description="Compare predicted intervention results with actual outcomes.",
    )


async def list_documents_fn(_: None) -> dict[str, Any]:
    return {
        "documents": documents.list(),
        "categories": DOC_CATEGORIES,
    }


@register_function(ListDocumentsConfig)
async def list_documents(config, builder):
    yield FunctionInfo.from_fn(
        list_documents_fn,
        description="List the documents and document categories available to the digital twin.",
    )

@register_function(MonitoringAgentConfig)
async def monitoring_agent(config, builder):
    async def monitor(_: None) -> dict[str, Any]:
        snapshot_fn = await builder.get_function("get_twin_snapshot")
        snapshot = await snapshot_fn.ainvoke(None)

        return {
            "agent": "monitoring",
            "status": "healthy" if snapshot["confidence"] >= snapshot["threshold"] else "uncertain",
            "confidence": snapshot["confidence"],
            "threshold": snapshot["threshold"],
            "focus": snapshot["focus"],
            "focus_station": snapshot["focus_station"],
            "metrics": snapshot["metrics"],
            "alerts": snapshot["totals"]["alerts"],
        }

    yield FunctionInfo.from_fn(
        monitor,
        description=(
            "Monitoring agent that observes the digital twin, "
            "detects anomalies and reports the current station health."
        ),
    )
@register_function(EvidenceAgentConfig)
async def evidence_agent(config, builder):
    async def investigate(_: None) -> dict[str, Any]:
        evidence_fn = await builder.get_function("get_evidence_options")
        options = await evidence_fn.ainvoke(None)

        return {
            "agent": "evidence",
            "status": "evidence_available",
            "options": options,
        }

    yield FunctionInfo.from_fn(
        investigate,
        description=(
            "Evidence agent that identifies available evidence sources "
            "needed to increase confidence in the digital twin diagnosis."
        ),
    )
@register_function(RootCauseAgentConfig)
async def root_cause_agent(config, builder):
    async def analyze(_: None) -> dict[str, Any]:
        causes_fn = await builder.get_function("get_causes")
        causes = await causes_fn.ainvoke(None)

        return {
            "agent": "root_cause",
            "status": "analysis_complete",
            "causes": causes,
        }

    yield FunctionInfo.from_fn(
        analyze,
        description=(
            "Root-cause agent that evaluates evidence and identifies "
            "the most supported causes of the detected issue."
        ),
    )
@register_function(SimulationAgentConfig)
async def simulation_agent(config, builder):
    async def simulate(_: None) -> dict[str, Any]:
        scenarios_fn = await builder.get_function("get_scenarios")
        scenarios = await scenarios_fn.ainvoke(None)

        return {
            "agent": "simulation",
            "status": "simulation_ready",
            "scenarios": scenarios,
        }

    yield FunctionInfo.from_fn(
        simulate,
        description=(
            "Simulation agent that evaluates available what-if "
            "interventions and returns their predicted impact."
        ),
    )

@register_function(DecisionAgentConfig)
async def decision_agent(config, builder):
    async def decide(_: None) -> dict[str, Any]:
        scenarios_fn = await builder.get_function("get_scenarios")
        scenarios = await scenarios_fn.ainvoke(None)

        return {
            "agent": "decision",
            "status": "awaiting_human_approval",
            "scenarios": scenarios,
            "requires_human": True,
        }

    yield FunctionInfo.from_fn(
        decide,
        description=(
            "Decision agent that presents simulated intervention options "
            "and waits for explicit human approval or rejection."
        ),
    )

@register_function(LearningAgentConfig)
async def learning_agent(config, builder):
    async def learn(_: None) -> dict[str, Any]:
        outcome_fn = await builder.get_function("get_outcome")
        outcome = await outcome_fn.ainvoke(None)

        return {
            "agent": "learning",
            "status": "learning_complete",
            "outcome": outcome,
        }

    yield FunctionInfo.from_fn(
        learn,
        description=(
            "Learning agent that compares predicted and actual outcomes "
            "and captures the result for future digital twin decisions."
        ),
    )

@register_function(DigitalTwinOrchestratorConfig)
async def digital_twin_orchestrator(config, builder):
    async def orchestrate(_: None) -> dict[str, Any]:
        monitoring = await builder.get_function("monitoring_agent")
        monitoring_result = await monitoring.ainvoke(None)

        evidence_agent = await builder.get_function("evidence_agent")
        evidence_result = await evidence_agent.ainvoke(None)

        

        if monitoring_result["confidence"] < monitoring_result["threshold"]:
            return {
                "status": "needs_evidence",
                "stage": "evidence",
                "monitoring": monitoring_result,
                "evidence": evidence_result,
            }

        root_cause = await builder.get_function("root_cause_agent")
        root_cause_result = await root_cause.ainvoke(None)

        simulation = await builder.get_function("simulation_agent")
        simulation_result = await simulation.ainvoke(None)
        decision = await builder.get_function("decision_agent")
        decision_result = await decision.ainvoke(None)

        return {
            "status": "ready_for_human_decision",
            "stage": "decision",
            "monitoring": monitoring_result,
            "evidence": evidence_result,
            "root_cause": root_cause_result,
            "simulation": simulation_result,
            "decision": decision_result,
        }

    yield FunctionInfo.from_fn(
        orchestrate,
        description=(
            "Orchestrate the digital twin investigation from monitoring "
            "through evidence, root-cause analysis and what-if scenarios."
        ),
    )

# ---------- Test ----------

async def test_nat() -> dict[str, Any]:

    async with WorkflowBuilder() as builder:

        snapshot = await builder.add_function(
            name="get_twin_snapshot",
            config=GetTwinSnapshotConfig(),
        )

        evidence_options = await builder.add_function(
            name="get_evidence_options",
            config=GetEvidenceOptionsConfig(),
        )

        evidence = await builder.add_function(
            name="collect_evidence",
            config=CollectEvidenceConfig(),
        )

        causes = await builder.add_function(
            name="get_causes",
            config=GetCausesConfig(),
        )

        scenarios = await builder.add_function(
            name="get_scenarios",
            config=GetScenariosConfig(),
        )

        decision = await builder.add_function(
            name="make_decision",
            config=MakeDecisionConfig(),
        )

        outcome = await builder.add_function(
            name="get_outcome",
            config=GetOutcomeConfig(),
        )

        docs = await builder.add_function(
            name="list_documents",
            config=ListDocumentsConfig(),
        )

        await builder.add_function(
            name="monitoring_agent",
            config=MonitoringAgentConfig(),
        )
        await builder.add_function(
            name="evidence_agent",
            config=EvidenceAgentConfig(),
        )
        await builder.add_function(
            name="root_cause_agent",
            config=RootCauseAgentConfig(),
        )
        await builder.add_function(
            name="simulation_agent",
            config=SimulationAgentConfig(),
        )
        await builder.add_function(
            name="decision_agent",
            config=DecisionAgentConfig(),
        )
        await builder.add_function(
            name="learning_agent",
            config=LearningAgentConfig(),
        )

        return {
            "snapshot": await snapshot.ainvoke(None),
            "evidence_options": await evidence_options.ainvoke(None),
            "evidence": await evidence.ainvoke(
                EvidenceInput(evidence_id="camera")
            ),
            "causes": await causes.ainvoke(None),
            "scenarios": await scenarios.ainvoke(None),
            "decision": await decision.ainvoke(
                DecisionInput(
                    scenario_id="adjust",
                    verdict="approve",
                )
            ),
            "outcome": await outcome.ainvoke(None),
            "documents": await docs.ainvoke(None),
        }

async def test_orchestrator() -> dict[str, Any]:
    async with WorkflowBuilder() as builder:
        await builder.add_function(
            name="get_twin_snapshot",
            config=GetTwinSnapshotConfig(),
        )

        await builder.add_function(
            name="get_evidence_options",
            config=GetEvidenceOptionsConfig(),
        )

        await builder.add_function(
            name="get_causes",
            config=GetCausesConfig(),
        )

        await builder.add_function(
            name="get_scenarios",
            config=GetScenariosConfig(),
        )

        
        await builder.add_function(
            name="monitoring_agent",
            config=MonitoringAgentConfig(),
        )
        await builder.add_function(
            name="evidence_agent",
            config=EvidenceAgentConfig(),
        )
        await builder.add_function(
            name="root_cause_agent",
            config=RootCauseAgentConfig(),
        )
        await builder.add_function(
            name="simulation_agent",
            config=SimulationAgentConfig(),
        )
        await builder.add_function(
            name="decision_agent",
            config=DecisionAgentConfig(),
        )
        await builder.add_function(
            name="learning_agent",
            config=LearningAgentConfig(),
        )
        await builder.set_workflow(
            DigitalTwinOrchestratorConfig()
        )
        workflow = await builder.build()

        async with workflow.run(None) as runner:
            return await runner.result()

async def test_learning() -> dict[str, Any]:
    async with WorkflowBuilder() as builder:
        await builder.add_function(
            name="get_outcome",
            config=GetOutcomeConfig(),
        )
        await builder.add_function(
            name="learning_agent",
            config=LearningAgentConfig(),
        )

        learning = await builder.get_function("learning_agent")
        return await learning.ainvoke(None)