import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { C, FONT } from "./theme";
import { useStore, Role } from "./store";
import { useClock, formatDate } from "./ui";

type BackendRole =
  | "ADMIN"
  | "FRONT_OFFICER"
  | "PHARMACIST";

type AuthUser = {
  id?: string;
  _id?: string;
  fullName: string;
  email: string;
  role: BackendRole;
  isActive?: boolean;
};

type LoginResponse = {
  success: boolean;
  message: string;
  token: string;
  user: AuthUser;
};

type RegisterResponse = {
  success: boolean;
  message: string;
  user: AuthUser;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5001/api";

function backendRoleToFrontendRole(
  role: BackendRole
): Role {
  switch (role) {
    case "ADMIN":
      return "admin";

    case "FRONT_OFFICER":
      return "receptionist";

    case "PHARMACIST":
      return "pharmacist";

    default:
      return "receptionist";
  }
}

function getDashboardPath(role: Role) {
  switch (role) {
    case "admin":
      return "/admin/dashboard";

    case "receptionist":
      return "/receptionist/dashboard";

    case "pharmacist":
      return "/pharmacy/queue";

    default:
      return "/receptionist/dashboard";
  }
}

function getRoleLabel(role: Role) {
  switch (role) {
    case "admin":
      return "Full Access";

    case "receptionist":
      return "Operations";

    case "pharmacist":
      return "Pharmacy Counter 1";

    default:
      return "Operations";
  }
}

function getInitial(name: string) {
  return (
    name.trim().charAt(0).toUpperCase() || "U"
  );
}

/*
 * =========================================================
 * REAL BACKEND REQUEST
 * =========================================================
 */

async function backendRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    }
  );

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  console.log(
    `[Caring Nest API] ${endpoint}`,
    response.status,
    data
  );

  if (!response.ok) {
    throw new Error(
      data?.message ||
      `Backend request failed with status ${response.status}`
    );
  }

  if (data?.success === false) {
    throw new Error(
      data?.message ||
      "Backend request failed"
    );
  }

  return data as T;
}

export default function LoginPage({
  pharmacist = false,
}: {
  pharmacist?: boolean;
}) {
  const { setUser } = useStore();
  const nav = useNavigate();
  const now = useClock();

  const [mode, setMode] = useState<
    "signin" | "signup"
  >("signin");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const [role, setRole] = useState<
    "admin" | "receptionist" | "pharmacist"
  >(pharmacist ? "pharmacist" : "admin");

  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirm?: string;
    general?: string;
  }>({});

  const resetErrors = () => {
    setErrors({});
  };

  /*
   * =========================================================
   * LOGIN SUCCESS HANDLER
   * =========================================================
   */

  const handleLoginSuccess = (
    response: LoginResponse
  ) => {
    if (
      !response ||
      response.success !== true ||
      !response.token ||
      !response.user
    ) {
      throw new Error(
        "Backend returned an incomplete login response."
      );
    }

    const backendRole =
      response.user.role;

    const frontendRole =
      backendRoleToFrontendRole(
        backendRole
      );

    const displayName =
      response.user.fullName ||
      response.user.email?.split("@")[0] ||
      "User";

    const userId =
      response.user.id ||
      response.user._id ||
      "";

    /*
     * Store the REAL JWT.
     */
    localStorage.setItem(
      "caringnest_auth_token",
      response.token
    );

    /*
     * Store authenticated user.
     * NEVER store password.
     */
    localStorage.setItem(
      "caringnest_auth_user",
      JSON.stringify({
        id: userId,
        fullName: displayName,
        email: response.user.email,
        role: backendRole,
        isActive:
          response.user.isActive !== false,
      })
    );

    console.log(
      "[Caring Nest] Authentication successful:",
      {
        id: userId,
        email: response.user.email,
        role: backendRole,
      }
    );

    /*
     * Update existing HMS frontend store.
     */
    setUser({
      name: displayName,
      role: frontendRole,
      initial: getInitial(displayName),
      roleLabel:
        getRoleLabel(frontendRole),
    });

    /*
     * Navigate after authentication
     * data has been stored.
     */
    const dashboard =
      getDashboardPath(frontendRole);

    console.log(
      "[Caring Nest] Navigating to:",
      dashboard
    );

    nav(dashboard);
  };

  /*
   * =========================================================
   * SUBMIT
   * =========================================================
   */

  const submit = async (e: FormEvent) => {
    e.preventDefault();

    if (loading) {
      return;
    }

    const errs: typeof errors = {};

    /*
     * -------------------------
     * Validation
     * -------------------------
     */

    if (
      mode === "signup" &&
      !name.trim()
    ) {
      errs.name = "Name is required";
    }

    if (!email.trim()) {
      errs.email = "Email is required";
    } else if (
      !/^\S+@\S+\.\S+$/.test(
        email.trim()
      )
    ) {
      errs.email =
        "Enter a valid email";
    }

    if (!password) {
      errs.password =
        "Password is required";
    } else if (
      mode === "signup" &&
      password.length < 6
    ) {
      errs.password =
        "Min 6 characters";
    }

    if (
      mode === "signup" &&
      password !== confirmPwd
    ) {
      errs.confirm =
        "Passwords do not match";
    }

    /*
     * ADMIN registration is intentionally blocked.
     */
    if (
      mode === "signup" &&
      role === "admin"
    ) {
      errs.general =
        "Admin accounts cannot be created from this screen. Please contact the hospital administrator.";
    }

    setErrors(errs);

    if (
      Object.keys(errs).length > 0
    ) {
      return;
    }

    setLoading(true);
    setErrors({});

    /*
     * =======================================================
     * SIGN IN
     * =======================================================
     */

    if (mode === "signin") {
      try {
        console.log(
          "[Caring Nest] Sending login request..."
        );

        const response =
          await backendRequest<LoginResponse>(
            "/auth/login",
            {
              method: "POST",
              body: JSON.stringify({
                email: email
                  .trim()
                  .toLowerCase(),
                password,
              }),
            }
          );

        console.log(
          "[Caring Nest] Backend login response received.",
          response
        );

        if (
          !response.success ||
          !response.token ||
          !response.user
        ) {
          throw new Error(
            "Login response from backend is incomplete."
          );
        }

        const returnedRole =
          backendRoleToFrontendRole(
            response.user.role
          );

        /*
         * Make sure selected login type
         * matches backend account.
         */
        if (
          pharmacist &&
          returnedRole !== "pharmacist"
        ) {
          throw new Error(
            "This account is not a pharmacist account."
          );
        }

        if (
          !pharmacist &&
          returnedRole !== role
        ) {
          throw new Error(
            `This account belongs to the ${response.user.role
              .toLowerCase()
              .replace("_", " ")} role. Please select the correct Login As option.`
          );
        }

        handleLoginSuccess(
          response
        );
      } catch (error) {
        console.error(
          "[Caring Nest] Login error:",
          error
        );

        const message =
          error instanceof Error
            ? error.message
            : "Unable to connect to the hospital backend.";

        setErrors({
          general: message,
        });

        setLoading(false);

        return;
      }

      setLoading(false);
      return;
    }

    /*
     * =======================================================
     * SIGN UP
     * =======================================================
     */

    try {
      const backendRole: BackendRole =
        role === "receptionist"
          ? "FRONT_OFFICER"
          : role === "pharmacist"
            ? "PHARMACIST"
            : "ADMIN";

      const response =
        await backendRequest<RegisterResponse>(
          "/auth/register",
          {
            method: "POST",
            body: JSON.stringify({
              fullName:
                name.trim(),
              email:
                email
                  .trim()
                  .toLowerCase(),
              password,
              role: backendRole,
            }),
          }
        );

      if (response.success) {
        setMode("signin");
        setName("");
        setPassword("");
        setConfirmPwd("");

        setErrors({
          general:
            "Account created successfully. Please sign in with your new account.",
        });
      }
    } catch (error) {
      console.error(
        "[Caring Nest] Registration error:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to create account.";

      setErrors({
        general: message,
      });
    } finally {
      setLoading(false);
    }
  };

  /*
   * =========================================================
   * UI
   * =========================================================
   */

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: FONT,
        background: C.white,
      }}
    >
      {/* LEFT */}
      <div
        style={{
          flex: "0 0 60%",
          background: `linear-gradient(135deg, ${C.navy} 0%, #1a3a70 50%, #0a1d3a 100%)`,
          color: C.white,
          padding: 40,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <div
          style={{
            fontSize: 13,
            opacity: 0.85,
          }}
        >
          {formatDate(now)} •{" "}
          {now.toLocaleTimeString(
            "en-US",
            {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }
          )}
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent:
              "center",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 90,
              height: 90,
              background: "#0a1d3a",
              borderRadius: 18,
              display: "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              marginBottom: 20,
              border:
                "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <span
              style={{
                color: C.red,
                fontSize: 50,
                fontWeight: 900,
              }}
            >
              ✚
            </span>
          </div>

          <h1
            style={{
              margin: 0,
              fontFamily: FONT,
              fontSize: 48,
              fontWeight: 800,
              letterSpacing: 0,
              fontStyle: "normal",
              color: C.white,
            }}
          >
            CARING-NEST HOSPITAL
          </h1>

          <div
            style={{
              marginTop: 16,
              background:
                "rgba(0,0,0,0.3)",
              padding:
                "8px 18px",
              borderRadius: 20,
              fontSize: 13,
              border:
                "1px solid rgba(255,255,255,0.1)",
            }}
          >
            🏥 AI Voice Agent &
            Smart Hospital
            Management
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 14,
          }}
        >
          {[
            {
              icon: "🏥",
              t: "OPD & IPD",
              s: "Complete patient flow",
            },
            {
              icon: "✏️",
              t: "Lab & Pharmacy",
              s: "Diagnostics & meds",
            },
            {
              icon: "📊",
              t: "Analytics",
              s: "Real-time insights",
            },
          ].map((f) => (
            <div
              key={f.t}
              style={{
                flex: 1,
                background:
                  "rgba(0,0,0,0.3)",
                padding: 18,
                borderRadius: 12,
                border:
                  "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  fontSize: 24,
                }}
              >
                {f.icon}
              </div>

              <div
                style={{
                  fontWeight: 700,
                  marginTop: 8,
                  fontSize: 14,
                }}
              >
                {f.t}
              </div>

              <div
                style={{
                  fontSize: 12,
                  opacity: 0.7,
                  marginTop: 2,
                }}
              >
                {f.s}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <div
        style={{
          flex: "0 0 40%",
          padding:
            "60px 50px",
          display: "flex",
          flexDirection:
            "column",
          justifyContent:
            "center",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 32,
            fontWeight: 800,
            color: C.textDark,
          }}
        >
          {mode === "signup"
            ? "Create your account"
            : "Welcome back"}
        </h2>

        <div
          style={{
            color: C.textMuted,
            marginTop: 6,
            marginBottom: 28,
            fontSize: 14,
          }}
        >
          {mode === "signup"
            ? `Sign up to access your ${pharmacist
              ? "pharmacy"
              : "hospital"
            } dashboard`
            : `Sign in to access your ${pharmacist
              ? "pharmacy"
              : "hospital"
            } dashboard`}
        </div>

        {errors.general && (
          <div
            style={{
              marginBottom: 18,
              padding:
                "11px 13px",
              borderRadius: 8,
              background:
                errors.general.includes(
                  "successfully"
                )
                  ? "#ECFDF5"
                  : "#FEF2F2",
              color:
                errors.general.includes(
                  "successfully"
                )
                  ? "#047857"
                  : C.red,
              border:
                errors.general.includes(
                  "successfully"
                )
                  ? "1px solid #A7F3D0"
                  : "1px solid #FECACA",
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            {errors.general}
          </div>
        )}

        <form onSubmit={submit}>
          {mode === "signup" && (
            <div
              style={{
                marginBottom: 16,
              }}
            >
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color:
                    C.textDark,
                  display:
                    "block",
                  marginBottom: 6,
                }}
              >
                Full Name
              </label>

              <div
                style={{
                  position:
                    "relative",
                }}
              >
                <span
                  style={{
                    position:
                      "absolute",
                    left: 12,
                    top: "50%",
                    transform:
                      "translateY(-50%)",
                  }}
                >
                  👤
                </span>

                <input
                  value={name}
                  onChange={(e) =>
                    setName(
                      e.target.value
                    )
                  }
                  type="text"
                  placeholder="Your full name"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding:
                      "12px 12px 12px 40px",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    fontSize: 14,
                    fontFamily:
                      FONT,
                    boxSizing:
                      "border-box",
                  }}
                />
              </div>

              {errors.name && (
                <div
                  style={{
                    color: C.red,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {errors.name}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              marginBottom: 16,
            }}
          >
            <label
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: C.textDark,
                display: "block",
                marginBottom: 6,
              }}
            >
              Email Address
            </label>

            <div
              style={{
                position:
                  "relative",
              }}
            >
              <span
                style={{
                  position:
                    "absolute",
                  left: 12,
                  top: "50%",
                  transform:
                    "translateY(-50%)",
                }}
              >
                📧
              </span>

              <input
                value={email}
                onChange={(e) =>
                  setEmail(
                    e.target.value
                  )
                }
                type="email"
                placeholder="you@hospital.com"
                disabled={loading}
                style={{
                  width: "100%",
                  padding:
                    "12px 12px 12px 40px",
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 14,
                  fontFamily: FONT,
                  boxSizing:
                    "border-box",
                }}
              />
            </div>

            {errors.email && (
              <div
                style={{
                  color: C.red,
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                {errors.email}
              </div>
            )}
          </div>

          <div
            style={{
              marginBottom: 18,
            }}
          >
            <label
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: C.textDark,
                display: "block",
                marginBottom: 6,
              }}
            >
              Password
            </label>

            <div
              style={{
                position:
                  "relative",
              }}
            >
              <span
                style={{
                  position:
                    "absolute",
                  left: 12,
                  top: "50%",
                  transform:
                    "translateY(-50%)",
                }}
              >
                🔒
              </span>

              <input
                value={password}
                onChange={(e) =>
                  setPassword(
                    e.target.value
                  )
                }
                type={
                  showPwd
                    ? "text"
                    : "password"
                }
                placeholder={
                  mode === "signup"
                    ? "Create a password (min 6 chars)"
                    : "Enter password"
                }
                disabled={loading}
                style={{
                  width: "100%",
                  padding:
                    "12px 40px 12px 40px",
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 14,
                  fontFamily: FONT,
                  boxSizing:
                    "border-box",
                }}
              />

              <span
                onClick={() =>
                  !loading &&
                  setShowPwd(
                    !showPwd
                  )
                }
                style={{
                  position:
                    "absolute",
                  right: 12,
                  top: "50%",
                  transform:
                    "translateY(-50%)",
                  cursor: loading
                    ? "default"
                    : "pointer",
                }}
              >
                {showPwd
                  ? "🙈"
                  : "👁️"}
              </span>
            </div>

            {errors.password && (
              <div
                style={{
                  color: C.red,
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                {errors.password}
              </div>
            )}
          </div>

          {mode === "signup" && (
            <div
              style={{
                marginBottom: 18,
              }}
            >
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: C.textDark,
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Confirm Password
              </label>

              <div
                style={{
                  position:
                    "relative",
                }}
              >
                <span
                  style={{
                    position:
                      "absolute",
                    left: 12,
                    top: "50%",
                    transform:
                      "translateY(-50%)",
                  }}
                >
                  🔒
                </span>

                <input
                  value={confirmPwd}
                  onChange={(e) =>
                    setConfirmPwd(
                      e.target.value
                    )
                  }
                  type={
                    showPwd
                      ? "text"
                      : "password"
                  }
                  placeholder="Re-enter password"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding:
                      "12px 12px 12px 40px",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    fontSize: 14,
                    fontFamily:
                      FONT,
                    boxSizing:
                      "border-box",
                  }}
                />
              </div>

              {errors.confirm && (
                <div
                  style={{
                    color: C.red,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  {errors.confirm}
                </div>
              )}
            </div>
          )}

          {!pharmacist && (
            <div
              style={{
                marginBottom: 20,
              }}
            >
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: C.textDark,
                  display: "block",
                  marginBottom: 8,
                }}
              >
                {mode === "signup"
                  ? "Sign Up As"
                  : "Login As"}
              </label>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                }}
              >
                {[
                  {
                    k: "admin" as const,
                    icon: "🛡️",
                    t: "Admin",
                    s: "Full access",
                  },
                  {
                    k: "receptionist" as const,
                    icon: "🧑",
                    t: "Front Officer",
                    s: "Operations",
                  },
                  {
                    k: "pharmacist" as const,
                    icon: "💊",
                    t: "Pharmacist",
                    s: "Dispensing",
                  },
                ].map((o) => (
                  <div
                    key={o.k}
                    onClick={() => {
                      if (!loading) {
                        setRole(o.k);
                        setErrors({});
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: 14,
                      border: `2px solid ${role === o.k
                        ? C.navy
                        : C.border
                        }`,
                      borderRadius: 10,
                      cursor: loading
                        ? "default"
                        : "pointer",
                      textAlign:
                        "center",
                      background:
                        role === o.k
                          ? "#F1F5F9"
                          : C.white,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 22,
                      }}
                    >
                      {o.icon}
                    </div>

                    <div
                      style={{
                        fontWeight: 700,
                        marginTop: 4,
                        fontSize: 13,
                      }}
                    >
                      {o.t}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color:
                          C.textMuted,
                      }}
                    >
                      {o.s}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 14,
              background: loading
                ? "#64748B"
                : C.navy,
              color: C.white,
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: loading
                ? "not-allowed"
                : "pointer",
              fontFamily: FONT,
            }}
          >
            {loading
              ? "Please wait..."
              : mode === "signup"
                ? "Create Account →"
                : "Sign In →"}
          </button>

          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              marginTop: 14,
              fontSize: 13,
            }}
          >
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();

                if (!loading) {
                  alert(
                    "Password reset is not available yet. Please contact the hospital administrator."
                  );
                }
              }}
              style={{
                color: C.blue,
                textDecoration:
                  "none",
              }}
            >
              Forgot Password?
            </a>

            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();

                if (!loading) {
                  resetErrors();

                  setMode(
                    mode === "signup"
                      ? "signin"
                      : "signup"
                  );
                }
              }}
              style={{
                color: C.blue,
                textDecoration:
                  "none",
                fontWeight: 600,
              }}
            >
              {mode === "signup"
                ? "Already have an account? Sign In"
                : "Create Account"}
            </a>
          </div>

          <div
            style={{
              textAlign: "center",
              marginTop: 22,
              color: C.textLight,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            🔒 Secure login • JWT
            authenticated

            <div
              style={{
                marginTop: 4,
                color:
                  C.textMuted,
              }}
            >
              Connected to Caring
              Nest hospital
              backend
            </div>
          </div>
        </form>
      </div>
    </div>
  )
};