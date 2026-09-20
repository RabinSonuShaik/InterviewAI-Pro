import { useState } from "react";
import { supabase } from "./supabaseClient";
import "./Auth.css";

function Auth({ onLogin }) {
  const [isSignup, setIsSignup] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (error) throw error;

        if (data.user) {
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert({
              id: data.user.id,
              full_name: fullName,
              email,
            });

          if (profileError) {
            console.error("Profile error:", profileError);
          }
        }

        setMessage("Account created successfully. Please login.");
        setIsSignup(false);
      } else {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (error) throw error;

        if (data.user) {
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert({
              id: data.user.id,
              full_name:
                data.user.user_metadata?.full_name || "",
              email: data.user.email,
            });

          if (profileError) {
            console.error("Profile error:", profileError);
          }

          onLogin(data.user);
        }
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">

      <div className="auth-background-glow glow-one"></div>
      <div className="auth-background-glow glow-two"></div>

      <div className="auth-card">

        <div className="auth-logo">
          <div className="logo-icon">AI</div>
        </div>

        <h1>InterviewAI Pro</h1>

        <p className="auth-tagline">
          Your AI-powered interview preparation platform
        </p>

        <div className="auth-heading">
          <h2>
            {isSignup ? "Create your account" : "Welcome back"}
          </h2>

          <p>
            {isSignup
              ? "Start preparing smarter with AI."
              : "Continue your interview preparation."}
          </p>
        </div>

        <form onSubmit={handleAuth}>

          {isSignup && (
            <div className="input-group">
              <label>Full Name</label>

              <input
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="input-group">
            <label>Email Address</label>

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label>Password</label>

            <div className="password-wrapper">

              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowPassword(!showPassword)
                }
              >
                {showPassword ? "Hide" : "Show"}
              </button>

            </div>
          </div>

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : isSignup
              ? "Create Account →"
              : "Login →"}
          </button>

        </form>

        {message && (
          <div className="auth-message">
            {message}
          </div>
        )}

        <div className="auth-divider">
          <span>OR</span>
        </div>

        <p className="auth-switch">
          {isSignup
            ? "Already have an account?"
            : "Don't have an account?"}

          <button
            type="button"
            className="switch-button"
            onClick={() => {
              setIsSignup(!isSignup);
              setMessage("");
            }}
          >
            {isSignup ? "Login" : "Create account"}
          </button>
        </p>

        <div className="auth-footer">
          <span>🔒 Secure authentication</span>
          <span>•</span>
          <span>Powered by AI</span>
        </div>

      </div>
    </div>
  );
}

export default Auth;