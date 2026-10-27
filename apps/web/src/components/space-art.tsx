/** Original vector space illustrations. Not camera footage or generated video evidence. */
export function SpaceArt({
  variant = "entrance",
  className = "",
}: {
  variant?: string;
  className?: string;
}) {
  const garden = variant.includes("garden") || variant.includes("courtyard");
  return (
    <svg
      className={`space-art ${className}`}
      viewBox="0 0 640 360"
      fill="none"
      role="img"
      aria-label={`Illustration of ${garden ? "a garden" : "an entrance"}; no camera footage`}
    >
      <path fill={garden ? "#E3ECE3" : "#EEECE5"} d="M0 0h640v360H0z" />
      <path fill={garden ? "#C7D7C9" : "#E1DED4"} d="M0 228h640v132H0z" />
      {garden ? (
        <>
          <path fill="#F1F0E6" d="m258 360 41-132h64l56 132z" />
          <path fill="#CCDCD5" d="M348 76h168v157H348z" />
          <path fill="#B5CBC1" d="m333 80 98-48 104 48z" />
          <path fill="#698B7F" d="M374 108h51v125h-51z" />
          <path fill="#A0BCB0" d="M444 108h44v48h-44z" />
          <path
            stroke="#87A28C"
            strokeWidth="5"
            d="M91 233V135m-36 43 36 28 42-42m-3-40-39 42-25-33"
          />
          <ellipse cx="90" cy="108" rx="64" ry="52" fill="#B0C8B0" />
          <ellipse cx="131" cy="141" rx="40" ry="43" fill="#AAC1AA" />
          <path
            fill="#9FB79C"
            d="M501 239c0-51 41-91 91-91v91zM543 256c0-38 30-68 67-68v68z"
          />
          <rect x="122" y="238" width="92" height="12" rx="3" fill="#A58F76" />
          <path stroke="#A58F76" strokeWidth="5" d="M134 248v29m67-29v29" />
        </>
      ) : (
        <>
          <path fill="#DFDCCF" d="M119 37h399v214H119z" />
          <path fill="#EAE7DC" d="M134 37h369v201H134z" />
          <path fill="#739387" d="M263 66h114v172H263z" />
          <path fill="#839F93" d="M272 76h96v161h-96z" />
          <rect x="286" y="93" width="67" height="64" rx="1" fill="#BCCDC3" />
          <path stroke="#88A096" strokeWidth="4" d="M320 93v64m-34-32h67" />
          <circle cx="354" cy="177" r="4" fill="#D9D2AE" />
          <path fill="#CBC7B9" d="M242 238h156v12H242z" />
          <rect x="162" y="89" width="64" height="76" fill="#AAC0B5" />
          <path stroke="#F1EFE7" strokeWidth="5" d="M194 89v76m-32-38h64" />
          <rect x="415" y="89" width="55" height="76" fill="#AAC0B5" />
          <path stroke="#F1EFE7" strokeWidth="5" d="M442 89v76m-27-38h55" />
          <path fill="#D1B596" d="M402 221h39v28h-39z" />
          <path stroke="#B79876" strokeWidth="2" d="M421 222v13" />
          <path
            fill="#ABBA9F"
            d="M165 238c-40-28-25-71 0-38 18-54 40-28 15 3 43-17 42 26-15 35"
          />
          <path fill="#B5A58D" d="M147 232h39l-6 29h-27z" />
          <path fill="#D0CDBF" d="m228 360 34-110h113l36 110z" />
        </>
      )}
      <path stroke="#FFFFFF" strokeOpacity=".28" d="M0 286h640M0 321h640" />
    </svg>
  );
}
