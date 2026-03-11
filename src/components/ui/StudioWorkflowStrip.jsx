const DEFAULT_STEPS = ["Brief", "Compile", "Generate", "Review", "Canon", "Archive"];

export default function StudioWorkflowStrip({
  currentStep = "Brief",
  steps = DEFAULT_STEPS,
  className = "",
}) {
  const activeIndex = Math.max(0, steps.findIndex((step) => step === currentStep));

  return (
    <div className={`studio-workflow-strip ${className}`.trim()}>
      {steps.map((step, index) => {
        const state = index < activeIndex ? "completed" : index === activeIndex ? "current" : "upcoming";
        return (
          <div key={step} className={`studio-workflow-pill ${state}`}>
            <span className="studio-workflow-pill-dot" aria-hidden="true">
              {state === "completed" ? "✓" : "•"}
            </span>
            <span>{step}</span>
          </div>
        );
      })}
    </div>
  );
}
