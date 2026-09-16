import { CreateSessionButton } from "@/components/CreateSessionButton";

export default function LandingPage() {
  return (
    <main className="landing">
      <div className="landing-inner">
        <p className="eyebrow">Meet in the middle</p>
        <h1>Where2Eat</h1>
        <p className="tagline">
          Two people, two starting points — and a fair place to eat in between.
        </p>

        <div className="how">
          <div className="step">
            <b>1</b>
            <span>Start a session and send the link to whoever you are meeting.</span>
          </div>
          <div className="step">
            <b>2</b>
            <span>You both say where you are setting off from.</span>
          </div>
          <div className="step">
            <b>3</b>
            <span>
              You both get the same map of popular places between you, with each
              person&rsquo;s distance side by side.
            </span>
          </div>
        </div>

        <CreateSessionButton />

        <p className="fineprint">
          No account, no app. Assumes you are both travelling by public transport.
          <br />
          Locations are deleted 24 hours after the session is created.
        </p>
      </div>
    </main>
  );
}
