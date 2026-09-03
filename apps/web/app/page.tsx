import config from "../../../triplane.config";
import { ConceptIndex } from "../components/ConceptIndex";
import { Landing } from "../components/Landing";

/**
 * "/" is the pitch on Triplane's own deployment and the concept index everywhere else.
 * A tenant's knowledge base advertising its vendor would undo the white-label claim the
 * tenant is there to demonstrate, so this is config, not a route check.
 */
export const dynamic = "force-dynamic";
export default function Home() {
  return config.landing ? <Landing /> : <ConceptIndex />;
}
