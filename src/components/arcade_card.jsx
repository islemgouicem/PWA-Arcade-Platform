import { cn } from "@/lib/utils";

const CARD_VARIANTS = {
    sm: {
        cardHeight: "254px",
        radius: "50px",
        cornerSize: "98px",
        cornerTopOffset: "-15px",
        cornerSideOffset: "-15px",
        cornerScale: 1.16,
        topRightCorner: "top_right_sm.png",
        bottomLeftCorner: "bottom_left_sm.png",
        topRightCornerMobile: "top_right_sm_mobile.png",
        bottomLeftCornerMobile: "bottom_left_sm_mobile.png",
        contentPadding: "px-7 sm:px-9 lg:px-10 py-8 sm:py-7",
        titleSize: "clamp(26px, 3.2vw, 40px)",
        iconClass: "h-[26px] w-[26px] sm:h-11 sm:w-11",
        mobileCornerSize: "82px",
        mobileCornerTopOffset: "-20px",
        mobileCornerSideOffset: "-20px",
        mobileCornerScale: 1.08,
    },
    md: {
        cardHeight: "468px",
        radius: "50px",
        cornerSize: "clamp(88px, 7.4vw, 106px)",
        cornerTopOffset: "-16px",
        cornerSideOffset: "-16px",
        cornerScale: 1.18,
        topRightCorner: "top_right_md.png",
        bottomLeftCorner: "bottom_left_md.png",
        topRightCornerMobile: "top_right_lg_mobile.png",
        bottomLeftCornerMobile: "bottom_left_lg_mobile.png",
        contentPadding: "px-8 sm:px-11 lg:px-12 py-10 sm:py-9",
        titleSize: "clamp(26px, 3.2vw, 40px)",
        iconClass: "h-[26px] w-[26px] sm:h-11 sm:w-11",
        mobileCornerSize: "88px",
        mobileCornerTopOffset: "-24px",
        mobileCornerSideOffset: "-24px",
        mobileCornerScale: 1.1,
    },
    lg: {
        cardHeight: "615px",
        radius: "50px",
        cornerSize: "clamp(94px, 8vw, 114px)",
        cornerTopOffset: "-18px",
        cornerSideOffset: "-18px",
        cornerScale: 1.2,
        topRightCorner: "top_right_lg.png",
        bottomLeftCorner: "bottom_left_lg.png",
        topRightCornerMobile: "top_right_lg_mobile.png",
        bottomLeftCornerMobile: "bottom_left_lg_mobile.png",
        contentPadding: "px-9 sm:px-14 lg:px-16 py-11 sm:py-10 lg:py-12",
        titleSize: "clamp(26px, 3.2vw, 40px)",
        iconClass: "h-[26px] w-[26px] sm:h-11 sm:w-11",
        mobileCornerSize: "88px",
        mobileCornerTopOffset: "-24px",
        mobileCornerSideOffset: "-24px",
        mobileCornerScale: 1.1,
    },
};

const ArcadeCard = ({
    title,
    icon,
    children,
    className,
    size = "md",
    cardHeight,
    radius,
    contentPadding,
    topRightCorner,
    bottomLeftCorner,
    cornerSize,
    cornerTopOffset,
    cornerSideOffset,
    cornerScale,
}) => {
    const variant = CARD_VARIANTS[size] ?? CARD_VARIANTS.md;
    const resolvedCardHeight = cardHeight ?? variant.cardHeight;
    const resolvedRadius = radius ?? variant.radius;
    const resolvedContentPadding = contentPadding ?? variant.contentPadding;
    const resolvedTopRightCorner = topRightCorner ?? variant.topRightCorner;
    const resolvedBottomLeftCorner = bottomLeftCorner ?? variant.bottomLeftCorner;
    const resolvedTopRightCornerMobile = variant.topRightCornerMobile ?? resolvedTopRightCorner;
    const resolvedBottomLeftCornerMobile = variant.bottomLeftCornerMobile ?? resolvedBottomLeftCorner;
    const resolvedCornerSize = cornerSize ?? variant.cornerSize;
    const resolvedCornerTopOffset = cornerTopOffset ?? variant.cornerTopOffset;
    const resolvedCornerSideOffset = cornerSideOffset ?? variant.cornerSideOffset;
    const resolvedCornerScale = cornerScale ?? variant.cornerScale;
    const resolvedMobileCornerSize = variant.mobileCornerSize ?? resolvedCornerSize;
    const resolvedMobileCornerTopOffset = variant.mobileCornerTopOffset ?? resolvedCornerTopOffset;
    const resolvedMobileCornerSideOffset = variant.mobileCornerSideOffset ?? resolvedCornerSideOffset;
    const resolvedMobileCornerScale = variant.mobileCornerScale ?? resolvedCornerScale;

    return (
        <>
            <style>{`
        .arcade-card-title-line {
                    background: linear-gradient(90deg, rgba(203, 120, 34, 0.95) 0%, rgba(203, 120, 34, 0.62) 30%, rgba(119, 134, 127, 0.25) 56%, rgba(119, 134, 127, 0) 100%);
        }

                .arcade-card-sheen {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(115deg, transparent 24%, rgba(203, 120, 34, 0.12) 44%, transparent 62%);
                    transform: translateX(-105%);
                    animation: arcadeCardSheen 5.8s ease-in-out infinite;
                    pointer-events: none;
                }

                @keyframes arcadeCardSheen {
                    0%, 70%, 100% {
                        transform: translateX(-105%);
                        opacity: 0;
                    }
                    80% {
                        transform: translateX(0%);
                        opacity: 1;
                    }
                    90% {
                        transform: translateX(120%);
                        opacity: 0;
                    }
                }

        @media (max-width: 767px) {
          [data-arcade-card-size="md"] {
            min-height: 532px !important;
            height: auto !important;
          }

          [data-arcade-card-size="lg"] {
            min-height: 710px !important;
            height: auto !important;
          }

          .arcade-card-title-line {
                        background: linear-gradient(90deg, rgba(203, 120, 34, 0.92) 0%, rgba(203, 120, 34, 0.76) 26%, rgba(119, 134, 127, 0.38) 54%, rgba(119, 134, 127, 0.16) 74%, rgba(119, 134, 127, 0) 100%);
          }
        }
      `}</style>
            <div
                data-arcade-card-size={size}
                className={cn(
                    "relative overflow-visible",
                    className
                )}
                style={{
                    height: resolvedCardHeight,
                    minHeight: resolvedCardHeight,
                    background: "linear-gradient(160deg, rgba(14, 17, 18, 0.9), rgba(7, 8, 8, 0.78))",
                    border: "1px solid rgba(203, 120, 34, 0.58)",
                    boxShadow:
                        "inset 0px 0px 24px rgba(119, 134, 127, 0.2), 0px 0px 24px rgba(203, 120, 34, 0.2)",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                    borderRadius: resolvedRadius,
                }}
            >
                <div
                    className="pointer-events-none absolute inset-[1px] overflow-hidden"
                    style={{ borderRadius: `calc(${resolvedRadius} - 1px)` }}
                >
                    <img
                        src="/Rectangle 410.png"
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 h-full w-full object-cover opacity-[0.09] mix-blend-screen"
                    />
                    <img
                        src="/target.png"
                        alt=""
                        aria-hidden="true"
                        className="absolute -bottom-8 -right-10 w-44 opacity-[0.11]"
                    />
                    <div className="arcade-card-sheen" />
                    <div className="absolute inset-0 bg-[radial-gradient(100%_65%_at_50%_0%,rgba(203,120,34,0.15),transparent_70%)]" />
                </div>

                <img
                    src={resolvedTopRightCorner}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 top-0 hidden select-none sm:block"
                    style={{
                        width: resolvedCornerSize,
                        height: "auto",
                        opacity: 0.96,
                        right: resolvedCornerSideOffset,
                        top: resolvedCornerTopOffset,
                        transform: `scale(${resolvedCornerScale})`,
                        transformOrigin: "top right",
                        filter: "drop-shadow(0 0 14px rgba(203, 120, 34, 0.55))",
                    }}
                />

                <img
                    src={resolvedTopRightCornerMobile}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 top-0 select-none sm:hidden"
                    style={{
                        width: resolvedMobileCornerSize,
                        height: "auto",
                        opacity: 0.96,
                        right: resolvedMobileCornerSideOffset,
                        top: resolvedMobileCornerTopOffset,
                        transform: `scale(${resolvedMobileCornerScale})`,
                        transformOrigin: "top right",
                        filter: "drop-shadow(0 0 14px rgba(203, 120, 34, 0.55))",
                    }}
                />

                <img
                    src={resolvedBottomLeftCorner}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 left-0 hidden select-none sm:block"
                    style={{
                        width: resolvedCornerSize,
                        height: "auto",
                        opacity: 0.96,
                        left: resolvedCornerSideOffset,
                        bottom: resolvedCornerTopOffset,
                        transform: `scale(${resolvedCornerScale})`,
                        transformOrigin: "bottom left",
                        filter: "drop-shadow(0 0 14px rgba(203, 120, 34, 0.55))",
                    }}
                />

                <img
                    src={resolvedBottomLeftCornerMobile}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 left-0 select-none sm:hidden"
                    style={{
                        width: resolvedMobileCornerSize,
                        height: "auto",
                        opacity: 0.96,
                        left: resolvedMobileCornerSideOffset,
                        bottom: resolvedMobileCornerTopOffset,
                        transform: `scale(${resolvedMobileCornerScale})`,
                        transformOrigin: "bottom left",
                        filter: "drop-shadow(0 0 14px rgba(203, 120, 34, 0.55))",
                    }}
                />


                {/* Inner content wrapper */}
                <div className={cn("relative z-10 flex h-full flex-col", resolvedContentPadding)}>
                    {/* Header */}
                    {title && (
                        <div className="mb-6 sm:mb-10">
                            <div className="mb-1 flex items-center gap-2 sm:gap-3">
                                {icon && <span className={cn("flex shrink-0 -translate-y-[3px] items-center justify-center text-[#CB7822]", variant.iconClass)}>{icon}</span>}
                                <h3
                                    className="font-compacta leading-none text-[#e4e9e5] tracking-[0.06em]"
                                    style={{ fontSize: variant.titleSize, lineHeight: 0.95 }}
                                >
                                    {title}
                                </h3>
                            </div>
                            <div
                                className="arcade-card-title-line mt-1"
                                style={{
                                    height: "1px",
                                    borderRadius: "50px",
                                }}
                            />
                        </div>
                    )}

                    {/* Content */}
                    <div className="flex flex-1 flex-col">{children}</div>
                </div>
            </div>
        </>
    );
};

export default ArcadeCard;
