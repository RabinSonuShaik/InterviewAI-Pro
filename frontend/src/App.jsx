import { useEffect, useRef, useState } from "react";
import Auth from "./Auth";
import { supabase } from "./supabaseClient";
import "./App.css";

function App() {
  const [user, setUser] = useState(null);

  const [role, setRole] = useState("Python Developer");
  const [difficulty, setDifficulty] = useState("Easy");
  const [questionCount, setQuestionCount] = useState(5);

  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answer, setAnswer] = useState("");

  const [sessionId, setSessionId] = useState(null);

  const [interviewStarted, setInterviewStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [listening, setListening] = useState(false);

  const [evaluations, setEvaluations] = useState([]);
  const [finalReport, setFinalReport] = useState(null);
  const [history, setHistory] = useState([]);

  const [showHistory, setShowHistory] = useState(false);
  const [showPractice, setShowPractice] = useState(false);
  const [showResume, setShowResume] = useState(false);

  const [practiceTopic, setPracticeTopic] =
    useState("Python");

  const [practiceDifficulty, setPracticeDifficulty] =
    useState("Easy");

  const [practiceCount, setPracticeCount] =
    useState(5);

  const [practiceQuestions, setPracticeQuestions] =
    useState([]);

  const [practiceLoading, setPracticeLoading] =
    useState(false);

  const [resumeFile, setResumeFile] = useState(null);
  const [resumeQuestions, setResumeQuestions] =
    useState([]);

  const [resumeLoading, setResumeLoading] =
    useState(false);

  const [resumeDifficulty, setResumeDifficulty] =
    useState("Easy");

  const [resumeCount, setResumeCount] =
    useState(5);

  const [darkMode, setDarkMode] = useState(() => {
    return (
      localStorage.getItem("interviewai-theme") ===
      "dark"
    );
  });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);

  /* ================================
     THEME
  ================================= */

  useEffect(() => {
    document.body.classList.toggle(
      "dark-mode",
      darkMode
    );

    localStorage.setItem(
      "interviewai-theme",
      darkMode ? "dark" : "light"
    );
  }, [darkMode]);

  /* ================================
     AUTH
  ================================= */

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  /* ================================
     CAMERA
  ================================= */

  useEffect(() => {
    if (interviewStarted) {
      startCamera();
    }

    return () => {
      stopCamera();
      stopVoiceInput();
    };
  }, [interviewStarted]);

  const startCamera = async () => {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Camera error:", error);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => track.stop());

      streamRef.current = null;
    }
  };

  /* ================================
     ERROR MESSAGE
  ================================= */

  const getErrorMessage = (error) => {
    if (!error) {
      return "Something went wrong.";
    }

    if (typeof error === "string") {
      return error;
    }

    if (error.message) {
      return error.message;
    }

    if (error.detail) {
      if (typeof error.detail === "string") {
        return error.detail;
      }

      try {
        return JSON.stringify(error.detail);
      } catch {
        return "Something went wrong.";
      }
    }

    try {
      return JSON.stringify(error);
    } catch {
      return "Something went wrong.";
    }
  };

  /* ================================
     PARSE QUESTIONS
  ================================= */

  const parseQuestions = (text) => {
    if (!text) {
      return [];
    }

    return text
      .split("\n")
      .map((line) =>
        line
          .replace(
            /^\s*\d+[\.\)]\s*/,
            ""
          )
          .trim()
      )
      .filter(Boolean);
  };

  /* ================================
     START INTERVIEW
  ================================= */

  const startInterview = async () => {
    setLoading(true);
    setEvaluations([]);
    setFinalReport(null);
    setSessionId(null);

    try {
      const response = await fetch(
        "http://localhost:8000/start-interview",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            role,
            difficulty,
            question_count: Number(questionCount),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Failed to start interview."
        );
      }

      const parsed = parseQuestions(
        data.questions
      );

      if (parsed.length === 0) {
        throw new Error(
          "No questions generated."
        );
      }

      if (!data.session_id) {
        throw new Error(
          "Interview session ID was not returned by the server."
        );
      }

      setQuestions(parsed);
      setCurrentQuestion(0);
      setAnswer("");

      // IMPORTANT
      setSessionId(data.session_id);

      setInterviewStarted(true);
    } catch (error) {
      console.error(
        "Start interview error:",
        error
      );

      alert(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  /* ================================
     VOICE INPUT
  ================================= */

  const startVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        "Speech recognition is not supported in this browser. Please use Google Chrome."
      );
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop error
      }

      recognitionRef.current = null;
    }

    const recognition =
      new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log(
        "Voice recognition started"
      );

      setListening(true);
    };

    recognition.onresult = (event) => {
      const transcript =
        event.results[0][0].transcript;

      console.log(
        "Voice answer:",
        transcript
      );

      setAnswer((previous) => {
        if (previous.trim()) {
          return (
            previous +
            " " +
            transcript
          );
        }

        return transcript;
      });
    };

    recognition.onerror = (event) => {
      console.error(
        "Speech recognition error:",
        event.error
      );

      setListening(false);

      if (event.error === "not-allowed") {
        alert(
          "Microphone permission is blocked. Please allow microphone access in Chrome."
        );
      } else if (
        event.error === "no-speech"
      ) {
        alert(
          "No speech detected. Please speak clearly and try again."
        );
      } else if (
        event.error === "audio-capture"
      ) {
        alert(
          "Microphone was not found. Please check your microphone."
        );
      } else {
        alert(
          "Voice recognition error: " +
            event.error
        );
      }
    };

    recognition.onend = () => {
      console.log(
        "Voice recognition ended"
      );

      setListening(false);

      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error) {
      console.error(
        "Could not start voice recognition:",
        error
      );

      setListening(false);
      recognitionRef.current = null;
    }
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop error
      }

      recognitionRef.current = null;
    }

    setListening(false);
  };

  /* ================================
     EVALUATE ANSWER
  ================================= */

  const evaluateCurrentAnswer = async () => {
    if (!answer.trim()) {
      alert(
        "Please answer the question first."
      );
      return;
    }

    if (!sessionId) {
      alert(
        "Interview session is missing. Please start the interview again."
      );
      return;
    }

    setEvaluating(true);

    try {
      const response = await fetch(
        "http://localhost:8000/evaluate-answer",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            // IMPORTANT
            session_id: sessionId,

            question:
              questions[currentQuestion],

            answer: answer,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Evaluation failed."
        );
      }

      setEvaluations((previous) => [
        ...previous,
        {
          question:
            questions[currentQuestion],

          answer: answer,

          score: data.score,

          feedback: data.feedback,
        },
      ]);

      if (
        currentQuestion <
        questions.length - 1
      ) {
        setCurrentQuestion(
          (previous) =>
            previous + 1
        );

        setAnswer("");
        setListening(false);
      } else {
        await generateReport();
      }
    } catch (error) {
      console.error(
        "Evaluation error:",
        error
      );

      alert(getErrorMessage(error));
    } finally {
      setEvaluating(false);
    }
  };

  /* ================================
     GENERATE REPORT
  ================================= */

  const generateReport = async () => {
    if (!sessionId) {
      console.error(
        "Cannot generate report: session ID missing."
      );

      setFinalReport({
        overall_feedback:
          "Interview completed successfully.",
      });

      stopCamera();
      setInterviewStarted(false);

      return;
    }

    try {
      const response = await fetch(
        "http://localhost:8000/generate-report",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            // IMPORTANT
            session_id: sessionId,

            role: role,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Failed to generate report."
        );
      }

      setFinalReport(data);

      stopCamera();
      stopVoiceInput();

      setInterviewStarted(false);
    } catch (error) {
      console.error(
        "Report error:",
        error
      );

      setFinalReport({
        overall_feedback:
          "Interview completed successfully.",
      });

      stopCamera();
      stopVoiceInput();

      setInterviewStarted(false);
    }
  };

  /* ================================
     LOAD HISTORY
  ================================= */

  const loadHistory = async () => {
    try {
      const response = await fetch(
        "http://localhost:8000/interview-history",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: user?.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Failed to load history."
        );
      }

      setHistory(data.history || []);
    } catch (error) {
      console.error(
        "History error:",
        error
      );

      alert(getErrorMessage(error));
    }
  };

  /* ================================
     PRACTICE QUESTIONS
  ================================= */

  const generatePracticeQuestions =
    async () => {
      setPracticeLoading(true);
      setPracticeQuestions([]);

      try {
        const response = await fetch(
          "http://localhost:8000/practice-questions",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              topic: practiceTopic,
              difficulty:
                practiceDifficulty,
              count: Number(
                practiceCount
              ),
            }),
          }
        );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.detail ||
              "Failed to generate practice questions."
          );
        }

        setPracticeQuestions(
          parseQuestions(data.questions)
        );
      } catch (error) {
        console.error(
          "Practice error:",
          error
        );

        alert(getErrorMessage(error));
      } finally {
        setPracticeLoading(false);
      }
    };

  /* ================================
     RESUME UPLOAD
  ================================= */

  const uploadResume = async () => {
    if (!resumeFile) {
      alert(
        "Please select your resume first."
      );
      return;
    }

    setResumeLoading(true);
    setResumeQuestions([]);

    try {
      const formData =
        new FormData();

      formData.append(
        "file",
        resumeFile
      );

      const uploadResponse =
        await fetch(
          "http://localhost:8000/upload-resume",
          {
            method: "POST",
            body: formData,
          }
        );

      const uploadData =
        await uploadResponse.json();

      if (!uploadResponse.ok) {
        throw new Error(
          uploadData.detail ||
            "Resume upload failed."
        );
      }

      const questionResponse =
        await fetch(
          "http://localhost:8000/resume-questions",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              resume_text:
                uploadData.text,

              role: role,

              difficulty:
                resumeDifficulty,

              count: Number(
                resumeCount
              ),
            }),
          }
        );

      const questionData =
        await questionResponse.json();

      if (!questionResponse.ok) {
        throw new Error(
          questionData.detail ||
            "Failed to generate resume questions."
        );
      }

      const parsedQuestions =
        parseQuestions(
          questionData.questions
        );

      if (
        parsedQuestions.length === 0
      ) {
        throw new Error(
          "No questions were generated."
        );
      }

      setResumeQuestions(
        parsedQuestions
      );
    } catch (error) {
      console.error(
        "Resume error:",
        error
      );

      alert(getErrorMessage(error));
    } finally {
      setResumeLoading(false);
    }
  };

  /* ================================
     LOGOUT
  ================================= */

  const logout = async () => {
    stopCamera();
    stopVoiceInput();

    await supabase.auth.signOut();
  };

  /* ================================
     LOGIN PAGE
  ================================= */

  if (!user) {
    return (
      <Auth
        onLogin={(loggedInUser) => {
          setUser(loggedInUser);
        }}
      />
    );
  }

  /* ================================
     RESUME PAGE
  ================================= */

  if (showResume) {
    return (
      <div className="app-container">
        <header className="topbar">
          <h1>
            📄 Resume Interview
          </h1>

          <div className="topbar-actions">
            <button
              className="theme-button"
              onClick={() =>
                setDarkMode(
                  (previous) =>
                    !previous
                )
              }
            >
              {darkMode
                ? "☀️ Light"
                : "🌙 Dark"}
            </button>

            <button
              onClick={() => {
                setShowResume(false);
                setResumeQuestions([]);
                setResumeFile(null);
              }}
            >
              ← Dashboard
            </button>
          </div>
        </header>

        <main className="page-content">
          <div className="page-card">
            <h2>
              Upload Your Resume
            </h2>

            <p className="muted">
              Upload your resume and
              Gemini will generate
              personalized interview
              questions.
            </p>

            <input
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(event) =>
                setResumeFile(
                  event.target.files?.[0] ||
                    null
                )
              }
            />

            <label>Role</label>

            <select
              value={role}
              onChange={(event) =>
                setRole(
                  event.target.value
                )
              }
            >
              <option>
                Python Developer
              </option>

              <option>
                AI/ML Engineer
              </option>

              <option>
                Software Developer
              </option>

              <option>
                Data Analyst
              </option>
            </select>

            <label>
              Difficulty
            </label>

            <select
              value={resumeDifficulty}
              onChange={(event) =>
                setResumeDifficulty(
                  event.target.value
                )
              }
            >
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>

            <label>
              Number of Questions
            </label>

            <select
              value={resumeCount}
              onChange={(event) =>
                setResumeCount(
                  Number(
                    event.target.value
                  )
                )
              }
            >
              <option value={5}>
                5
              </option>

              <option value={10}>
                10
              </option>

              <option value={15}>
                15
              </option>

              <option value={20}>
                20
              </option>
            </select>

            <button
              className="primary-button"
              onClick={uploadResume}
              disabled={resumeLoading}
            >
              {resumeLoading
                ? "Generating..."
                : "🚀 Generate Questions"}
            </button>
          </div>

          {resumeQuestions.length >
            0 && (
            <div className="questions-section">
              <h2>
                🎯 Personalized
                Questions
              </h2>

              {resumeQuestions.map(
                (
                  question,
                  index
                ) => (
                  <div
                    className="question-card"
                    key={index}
                  >
                    <span>
                      Question{" "}
                      {index + 1}
                    </span>

                    <p>
                      {question}
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </main>
      </div>
    );
  }

  /* ================================
     PRACTICE PAGE
  ================================= */

  if (showPractice) {
    return (
      <div className="app-container">
        <header className="topbar">
          <h1>
            📚 Practice Mode
          </h1>

          <div className="topbar-actions">
            <button
              className="theme-button"
              onClick={() =>
                setDarkMode(
                  (previous) =>
                    !previous
                )
              }
            >
              {darkMode
                ? "☀️ Light"
                : "🌙 Dark"}
            </button>

            <button
              onClick={() =>
                setShowPractice(false)
              }
            >
              ← Dashboard
            </button>
          </div>
        </header>

        <main className="page-content">
          <div className="page-card">
            <label>Topic</label>

            <select
              value={practiceTopic}
              onChange={(event) =>
                setPracticeTopic(
                  event.target.value
                )
              }
            >
              <option>
                Python
              </option>

              <option>
                AI / ML
              </option>

              <option>
                SQL
              </option>

              <option>
                OOP
              </option>
            </select>

            <label>
              Difficulty
            </label>

            <select
              value={practiceDifficulty}
              onChange={(event) =>
                setPracticeDifficulty(
                  event.target.value
                )
              }
            >
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>

            <label>
              Number of Questions
            </label>

            <select
              value={practiceCount}
              onChange={(event) =>
                setPracticeCount(
                  Number(
                    event.target.value
                  )
                )
              }
            >
              <option value={5}>
                5
              </option>

              <option value={10}>
                10
              </option>

              <option value={15}>
                15
              </option>

              <option value={20}>
                20
              </option>
            </select>

            <button
              className="primary-button"
              onClick={
                generatePracticeQuestions
              }
              disabled={
                practiceLoading
              }
            >
              {practiceLoading
                ? "Generating..."
                : "Generate Questions"}
            </button>
          </div>

          {practiceQuestions.length >
            0 && (
            <div className="questions-section">
              <h2>
                📝 Questions
              </h2>

              {practiceQuestions.map(
                (
                  question,
                  index
                ) => (
                  <div
                    className="question-card"
                    key={index}
                  >
                    <span>
                      Question{" "}
                      {index + 1}
                    </span>

                    <p>
                      {question}
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </main>
      </div>
    );
  }

  /* ================================
     FINAL REPORT
  ================================= */

  if (finalReport) {
    return (
      <div className="app-container">
        <header className="topbar">
          <h1>
            📊 Interview Report
          </h1>

          <button
            className="theme-button"
            onClick={() =>
              setDarkMode(
                (previous) =>
                  !previous
              )
            }
          >
            {darkMode
              ? "☀️ Light"
              : "🌙 Dark"}
          </button>
        </header>

        <main className="page-content">
          <div className="report-card">
            <h2>
              🎉 Interview Completed
            </h2>

            <div className="report-text">
              {finalReport.overall_feedback ||
                "Interview completed successfully."}
            </div>

            <button
              className="primary-button"
              onClick={() => {
                setFinalReport(null);
                setEvaluations([]);
                setQuestions([]);
                setCurrentQuestion(0);
                setAnswer("");
                setSessionId(null);
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  /* ================================
     INTERVIEW PAGE
  ================================= */

  if (interviewStarted) {
    const question =
      questions[currentQuestion];

    return (
      <div className="app-container">
        <header className="topbar">
          <h1>
            🎤 InterviewAI Pro
          </h1>

          <button
            className="theme-button"
            onClick={() =>
              setDarkMode(
                (previous) =>
                  !previous
              )
            }
          >
            {darkMode
              ? "☀️ Light"
              : "🌙 Dark"}
          </button>
        </header>

        <main className="interview-page">
          <div className="camera-card">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
            />

            <div className="camera-status">
              🔴 Camera Active
            </div>
          </div>

          <div className="interview-card">
            <div className="progress">
              Question{" "}
              {currentQuestion + 1}{" "}
              of{" "}
              {questions.length}
            </div>

            <h2>
              {question}
            </h2>

            <textarea
              value={answer}
              onChange={(event) =>
                setAnswer(
                  event.target.value
                )
              }
              placeholder="Type your answer here..."
              rows={7}
            />

            <div className="button-row">
              <button
                className="secondary-button"
                onClick={
                  listening
                    ? stopVoiceInput
                    : startVoiceInput
                }
              >
                {listening
                  ? "🔴 Listening..."
                  : "🎙️ Speak"}
              </button>

              <button
                className="primary-button"
                onClick={
                  evaluateCurrentAnswer
                }
                disabled={
                  evaluating ||
                  listening
                }
              >
                {evaluating
                  ? "Evaluating..."
                  : currentQuestion ===
                    questions.length -
                      1
                  ? "Finish Interview"
                  : "Submit Answer"}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ================================
     DASHBOARD
  ================================= */

  return (
    <div className="app-container">
      <header className="topbar">
        <div>
          <h1>
            🤖 InterviewAI Pro
          </h1>

          <p className="subtitle">
            AI-Powered Interview
            Preparation
          </p>
        </div>

        <div className="topbar-actions">
          <button
            className="theme-button"
            onClick={() =>
              setDarkMode(
                (previous) =>
                  !previous
              )
            }
          >
            {darkMode
              ? "☀️ Light"
              : "🌙 Dark"}
          </button>

          <button
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard">
        <div className="welcome-card">
          <h2>
            Welcome 👋
          </h2>

          <p>
            Prepare for your technical
            interviews with AI-powered
            practice.
          </p>
        </div>

        <div className="dashboard-grid">
          {/* AI INTERVIEW */}

          <div className="dashboard-card">
            <h2>
              🎤 AI Interview
            </h2>

            <p>
              Take a complete AI-powered
              technical interview.
            </p>

            <label>
              Role
            </label>

            <select
              value={role}
              onChange={(event) =>
                setRole(
                  event.target.value
                )
              }
            >
              <option>
                Python Developer
              </option>

              <option>
                AI/ML Engineer
              </option>

              <option>
                Software Developer
              </option>

              <option>
                Data Analyst
              </option>
            </select>

            <label>
              Difficulty
            </label>

            <select
              value={difficulty}
              onChange={(event) =>
                setDifficulty(
                  event.target.value
                )
              }
            >
              <option>
                Easy
              </option>

              <option>
                Medium
              </option>

              <option>
                Hard
              </option>
            </select>

            <label>
              Questions
            </label>

            <select
              value={questionCount}
              onChange={(event) =>
                setQuestionCount(
                  Number(
                    event.target.value
                  )
                )
              }
            >
              <option value={5}>
                5
              </option>

              <option value={10}>
                10
              </option>

              <option value={15}>
                15
              </option>

              <option value={20}>
                20
              </option>
            </select>

            <button
              className="primary-button"
              onClick={
                startInterview
              }
              disabled={loading}
            >
              {loading
                ? "Starting..."
                : "Start Interview"}
            </button>
          </div>

          {/* PRACTICE */}

          <div className="dashboard-card">
            <h2>
              📚 Practice Mode
            </h2>

            <p>
              Generate technical
              questions for practice.
            </p>

            <button
              className="primary-button"
              onClick={() => {
                setShowPractice(
                  true
                );

                setPracticeQuestions(
                  []
                );
              }}
            >
              Open Practice
            </button>
          </div>

          {/* RESUME */}

          <div className="dashboard-card">
            <h2>
              📄 Resume Interview
            </h2>

            <p>
              Upload your resume and
              generate personalized
              interview questions using
              Gemini.
            </p>

            <button
              className="primary-button"
              onClick={() => {
                setShowResume(true);
                setResumeFile(null);
                setResumeQuestions(
                  []
                );
              }}
            >
              Upload Resume
            </button>
          </div>

          {/* HISTORY */}

          <div className="dashboard-card">
            <h2>
              📜 Interview History
            </h2>

            <p>
              View your previous
              interview performance.
            </p>

            <button
              className="secondary-button"
              onClick={() => {
                setShowHistory(true);
                loadHistory();
              }}
            >
              View History
            </button>
          </div>
        </div>

        {/* HISTORY SECTION */}

        {showHistory && (
          <div className="history-section">
            <div className="history-header">
              <h2>
                📜 Your Interview
                History
              </h2>

              <button
                onClick={() =>
                  setShowHistory(
                    false
                  )
                }
              >
                Close
              </button>
            </div>

            {history.length ===
            0 ? (
              <p className="muted">
                No interview history
                found.
              </p>
            ) : (
              history.map(
                (
                  item,
                  index
                ) => (
                  <div
                    className="history-card"
                    key={
                      item.id ||
                      index
                    }
                  >
                    <h3>
                      {item.role}
                    </h3>

                    <p>
                      Difficulty:{" "}
                      {
                        item.difficulty
                      }
                    </p>

                    <p>
                      Questions:{" "}
                      {
                        item.total_questions
                      }
                    </p>

                    <p>
                      Average Score:{" "}
                      {item.average_score ??
                        "N/A"}
                      /10
                    </p>

                    <p>
                      {item.overall_feedback ||
                        "No feedback available."}
                    </p>
                  </div>
                )
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;