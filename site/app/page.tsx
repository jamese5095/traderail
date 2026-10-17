import {PitchDeck} from '../../frontend/components/pitch/deck';
export default function Page(){return <PitchDeck published assetBase={process.env.PAGES_BASE_PATH??'/traderail'} />;}
