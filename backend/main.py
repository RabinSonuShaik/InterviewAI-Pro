import os
import re
import io

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from supabase import create_client

from llm_service import (
    generate_interview_questions,
    evaluate_answer,
    generate_overall_feedback,
)


# =========================================================
# ENVIRONMENT
# =========================================================

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_KEY
)


# =========================================================
# FASTAPI
# =========================================================

app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# MODELS
# =========================================================

class InterviewRequest(BaseModel):
    role: str
    difficulty: str
    question_count: int


class AnswerRequest(BaseModel):
    session_id: int
    question: str
    answer: str


class ReportRequest(BaseModel):
    session_id: int
    role: str
    user_id: str


class HistoryRequest(BaseModel):
    user_id: str


class PracticeRequest(BaseModel):
    topic: str
    difficulty: str
    count: int


class ResumeQuestionRequest(BaseModel):
    resume_text: str
    role: str
    difficulty: str
    count: int


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():
    return {
        "message": "InterviewAI Pro Backend is Working!"
    }


# =========================================================
# QUESTIONS
# =========================================================

@app.get("/questions")
def get_questions():

    try:

        response = (
            supabase
            .table("questions")
            .select("*")
            .execute()
        )

        return response.data

    except Exception as e:

        print("QUESTIONS ERROR:", repr(e))

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# =========================================================
# START INTERVIEW
# =========================================================

@app.post("/start-interview")
def start_interview(
    request: InterviewRequest
):

    try:

        generated_questions = None

        # -------------------------------------------------
        # Try Gemini first
        # -------------------------------------------------

        try:

            generated_questions = (
                generate_interview_questions(
                    request.role,
                    request.difficulty,
                    request.question_count
                )
            )

        except Exception as gemini_error:

            print(
                "Gemini unavailable, using Supabase fallback:",
                repr(gemini_error)
            )

        # -------------------------------------------------
        # Supabase fallback
        # -------------------------------------------------

        if not generated_questions:

            questions_response = (
                supabase
                .table("questions")
                .select("*")
                .eq(
                    "difficulty",
                    request.difficulty
                )
                .limit(
                    request.question_count
                )
                .execute()
            )

            questions = questions_response.data

            if not questions:

                questions_response = (
                    supabase
                    .table("questions")
                    .select("*")
                    .limit(
                        request.question_count
                    )
                    .execute()
                )

                questions = questions_response.data

            if not questions:

                raise HTTPException(
                    status_code=500,
                    detail="No questions available."
                )

            generated_questions = "\n".join(
                [
                    f"{index + 1}. {item['question']}"
                    for index, item
                    in enumerate(questions)
                ]
            )

        # -------------------------------------------------
        # Create session
        # -------------------------------------------------

        session_response = (
            supabase
            .table("interview_sessions")
            .insert({
                "role": request.role,
                "difficulty": request.difficulty,
                "question_count": request.question_count,
                "questions": generated_questions
            })
            .execute()
        )

        if not session_response.data:

            raise HTTPException(
                status_code=500,
                detail="Failed to create interview session."
            )

        session = session_response.data[0]

        return {
            "message":
                "Interview started successfully",

            "session_id":
                session["id"],

            "role":
                request.role,

            "difficulty":
                request.difficulty,

            "question_count":
                request.question_count,

            "questions":
                generated_questions
        }

    except HTTPException:
        raise

    except Exception as e:

        print(
            "START INTERVIEW ERROR:",
            repr(e)
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# =========================================================
# EVALUATE ANSWER
# =========================================================

@app.post("/evaluate-answer")
def evaluate_candidate_answer(
    request: AnswerRequest
):

    try:

        if not request.session_id:

            raise HTTPException(
                status_code=400,
                detail="Interview session ID is required."
            )

        if not request.question.strip():

            raise HTTPException(
                status_code=400,
                detail="Question is required."
            )

        if not request.answer.strip():

            raise HTTPException(
                status_code=400,
                detail="Answer is required."
            )

        # -------------------------------------------------
        # Check existing evaluation
        # -------------------------------------------------

        existing = (
            supabase
            .table("interview_answers")
            .select("*")
            .eq(
                "session_id",
                request.session_id
            )
            .eq(
                "question",
                request.question
            )
            .execute()
        )

        if existing.data:

            old_answer = existing.data[0]

            return {
                "message":
                    "Answer already evaluated",

                "score":
                    old_answer.get("score"),

                "evaluation":
                    old_answer.get("feedback"),

                "feedback":
                    old_answer.get("feedback"),

                "data":
                    old_answer
            }

        # -------------------------------------------------
        # Gemini evaluation
        # -------------------------------------------------

        try:

            evaluation = evaluate_answer(
                request.question,
                request.answer
            )

            print(
                "Gemini evaluation:",
                evaluation
            )

        except Exception as gemini_error:

            print(
                "Gemini evaluation unavailable:",
                repr(gemini_error)
            )

            # ---------------------------------------------
            # Instant fallback evaluation
            # ---------------------------------------------

            answer_length = len(
                request.answer.strip()
            )

            if answer_length >= 200:
                score = 8

            elif answer_length >= 100:
                score = 7

            elif answer_length >= 50:
                score = 6

            elif answer_length >= 20:
                score = 5

            else:
                score = 3

            evaluation = (
                f"Score: {score}/10\n"
                "Feedback: Your answer has been recorded. "
                "Continue improving technical accuracy, "
                "clarity and explanation."
            )

        # -------------------------------------------------
        # Extract score
        # -------------------------------------------------

        score_match = re.search(
            r"Score\s*:\s*(\d+(?:\.\d+)?)\s*/\s*10",
            evaluation,
            re.IGNORECASE
        )

        if score_match:

            score = int(
                float(
                    score_match.group(1)
                )
            )

        else:

            score = 5

        score = max(
            0,
            min(score, 10)
        )

        # -------------------------------------------------
        # Save answer
        # -------------------------------------------------

        answer_response = (
            supabase
            .table("interview_answers")
            .insert({
                "session_id":
                    request.session_id,

                "question":
                    request.question,

                "answer":
                    request.answer,

                "score":
                    score,

                "feedback":
                    evaluation
            })
            .execute()
        )

        return {

            "message":
                "Answer evaluated successfully",

            "score":
                score,

            "evaluation":
                evaluation,

            "feedback":
                evaluation,

            "data":
                answer_response.data
        }

    except HTTPException:
        raise

    except Exception as e:

        print(
            "EVALUATE ANSWER ERROR:",
            repr(e)
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# =========================================================
# GENERATE REPORT
# =========================================================

@app.post("/generate-report")
def generate_report(
    request: ReportRequest
):

    try:

        session_response = (
            supabase
            .table("interview_sessions")
            .select(
                "role, difficulty, question_count"
            )
            .eq(
                "id",
                request.session_id
            )
            .single()
            .execute()
        )

        if not session_response.data:

            raise HTTPException(
                status_code=404,
                detail="Interview session not found."
            )

        session = session_response.data

        session_difficulty = (
            session["difficulty"]
        )

        answers_response = (
            supabase
            .table("interview_answers")
            .select("*")
            .eq(
                "session_id",
                request.session_id
            )
            .execute()
        )

        answers = answers_response.data

        if not answers:

            raise HTTPException(
                status_code=404,
                detail="No interview answers found."
            )

        # -------------------------------------------------
        # Remove duplicate questions
        # -------------------------------------------------

        unique_answers = {}

        for answer in answers:

            question = answer["question"]

            if question not in unique_answers:

                unique_answers[question] = answer

        answers = list(
            unique_answers.values()
        )

        # -------------------------------------------------
        # Average score
        # -------------------------------------------------

        scores = [
            answer["score"]
            for answer in answers
            if answer["score"] is not None
        ]

        if scores:

            average_score = round(
                sum(scores) / len(scores),
                2
            )

        else:

            average_score = 0

        # -------------------------------------------------
        # Overall feedback
        # -------------------------------------------------

        try:

            overall_feedback = (
                generate_overall_feedback(
                    request.role,
                    average_score,
                    answers
                )
            )

        except Exception as gemini_error:

            print(
                "Gemini report unavailable:",
                repr(gemini_error)
            )

            overall_feedback = (
                "Interview completed successfully. "
                "Your answers were evaluated and "
                "your score has been recorded. "
                "Continue practicing technical "
                "concepts and improve your answer "
                "clarity."
            )

        # -------------------------------------------------
        # Save report
        # -------------------------------------------------

        report_response = (
            supabase
            .table("interview_reports")
            .insert({
                "session_id":
                    request.session_id,

                "total_questions":
                    len(answers),

                "average_score":
                    average_score,

                "overall_feedback":
                    overall_feedback
            })
            .execute()
        )

        # -------------------------------------------------
        # Save history
        # -------------------------------------------------

        history_response = (
            supabase
            .table("interview_history")
            .insert({
                "user_id":
                    request.user_id,

                "session_id":
                    request.session_id,

                "role":
                    request.role,

                "difficulty":
                    session_difficulty,

                "total_questions":
                    len(answers),

                "average_score":
                    average_score,

                "overall_feedback":
                    overall_feedback
            })
            .execute()
        )

        return {

            "message":
                "Report generated successfully",

            "session_id":
                request.session_id,

            "total_questions":
                len(answers),

            "average_score":
                average_score,

            "overall_feedback":
                overall_feedback,

            "report":
                report_response.data,

            "history":
                history_response.data
        }

    except HTTPException:
        raise

    except Exception as e:

        print(
            "REPORT ERROR:",
            repr(e)
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# =========================================================
# INTERVIEW HISTORY
# =========================================================

@app.post("/interview-history")
def get_interview_history(
    request: HistoryRequest
):

    try:

        response = (
            supabase
            .table("interview_history")
            .select("*")
            .eq(
                "user_id",
                request.user_id
            )
            .order(
                "created_at",
                desc=True
            )
            .execute()
        )

        return {

            "message":
                "Interview history loaded",

            "history":
                response.data
        }

    except Exception as e:

        print(
            "HISTORY ERROR:",
            repr(e)
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# =========================================================
# PRACTICE QUESTIONS
# =========================================================

@app.post("/practice-questions")
def practice_questions(
    request: PracticeRequest
):

    try:

        topic = request.topic.strip()
        count = max(
            1,
            min(request.count, 20)
        )

        # -------------------------------------------------
        # Local question bank
        # -------------------------------------------------

        question_bank = {

            "python": [
                "What are the main features of Python?",
                "What is the difference between a list and a tuple?",
                "What is a dictionary in Python?",
                "Explain Python functions.",
                "What is object-oriented programming in Python?",
                "What is inheritance?",
                "What is exception handling?",
                "What is a Python module?",
                "What is the difference between == and is?",
                "What are Python decorators?",
                "What is list comprehension?",
                "Explain mutable and immutable objects.",
                "What is a lambda function?",
                "What are *args and **kwargs?",
                "How does a while loop work in Python?"
            ],

            "sql": [
                "What is SQL?",
                "What is a primary key?",
                "What is a foreign key?",
                "What is normalization?",
                "Explain INNER JOIN.",
                "What is the difference between WHERE and HAVING?",
                "What is GROUP BY?",
                "What is ORDER BY?",
                "What is a subquery?",
                "What is an index?",
                "Explain ACID properties.",
                "What is a database transaction?",
                "What is the difference between DELETE and TRUNCATE?",
                "What is a view?",
                "What is a stored procedure?"
            ],

            "ai": [
                "What is Artificial Intelligence?",
                "What is Machine Learning?",
                "What is Deep Learning?",
                "What is supervised learning?",
                "What is unsupervised learning?",
                "What is reinforcement learning?",
                "What is overfitting?",
                "What is underfitting?",
                "What is a neural network?",
                "What is a loss function?",
                "What is an activation function?",
                "What is generative AI?",
                "What is an LLM?",
                "What is a transformer?",
                "What is prompt engineering?"
            ],

            "machine learning": [
                "What is Machine Learning?",
                "What is supervised learning?",
                "What is unsupervised learning?",
                "What is reinforcement learning?",
                "What is overfitting?",
                "What is underfitting?",
                "What is train-test split?",
                "What is cross-validation?",
                "What is feature engineering?",
                "What is classification?",
                "What is regression?",
                "What is clustering?",
                "What is precision?",
                "What is recall?",
                "What is F1-score?"
            ]
        }

        key = topic.lower()

        if key in question_bank:

            selected = question_bank[key]

        elif "machine" in key:

            selected = question_bank["machine learning"]

        elif "sql" in key or "database" in key:

            selected = question_bank["sql"]

        elif "ai" in key:

            selected = question_bank["ai"]

        else:

            selected = [
                f"What is {topic}?",
                f"Explain the main concepts of {topic}.",
                f"What are the advantages of {topic}?",
                f"What are the disadvantages of {topic}?",
                f"Where is {topic} used?",
                f"Explain an important feature of {topic}.",
                f"What are common challenges in {topic}?",
                f"Give a practical example of {topic}.",
                f"How would you troubleshoot a problem in {topic}?",
                f"What interview questions are commonly asked about {topic}?"
            ]

        # -------------------------------------------------
        # Difficulty modification
        # -------------------------------------------------

        if request.difficulty.lower() == "hard":

            selected = selected + [
                f"Explain an advanced real-world problem involving {topic}.",
                f"How would you optimize a solution involving {topic}?",
                f"Compare two different approaches to solving a {topic} problem."
            ]

        elif request.difficulty.lower() == "medium":

            selected = selected + [
                f"Explain a practical use case of {topic}.",
                f"What are common mistakes when working with {topic}?"
            ]

        selected = selected[:count]

        result = "\n".join(
            f"{index + 1}. {question}"
            for index, question
            in enumerate(selected)
        )

        return {
            "questions": result
        }

    except Exception as e:

        print(
            "PRACTICE QUESTIONS ERROR:",
            repr(e)
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# =========================================================
# UPLOAD RESUME
# =========================================================

@app.post("/upload-resume")
async def upload_resume(
    file: UploadFile = File(...)
):

    try:

        if not file.filename:

            raise HTTPException(
                status_code=400,
                detail="Please select a resume file."
            )

        filename = file.filename.lower()

        file_bytes = await file.read()

        if not file_bytes:

            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty."
            )

        extracted_text = ""

        # -------------------------------------------------
        # TXT
        # -------------------------------------------------

        if filename.endswith(".txt"):

            extracted_text = (
                file_bytes
                .decode(
                    "utf-8",
                    errors="ignore"
                )
            )

        # -------------------------------------------------
        # PDF
        # -------------------------------------------------

        elif filename.endswith(".pdf"):

            try:

                from pypdf import PdfReader

                reader = PdfReader(
                    io.BytesIO(file_bytes)
                )

                pages = []

                for page in reader.pages:

                    text = page.extract_text()

                    if text:

                        pages.append(text)

                extracted_text = "\n".join(
                    pages
                )

            except Exception as e:

                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Could not read PDF resume: "
                        + str(e)
                    )
                )

        # -------------------------------------------------
        # DOCX
        # -------------------------------------------------

        elif filename.endswith(".docx"):

            try:

                from docx import Document

                document = Document(
                    io.BytesIO(file_bytes)
                )

                paragraphs = [
                    paragraph.text
                    for paragraph
                    in document.paragraphs
                    if paragraph.text.strip()
                ]

                extracted_text = "\n".join(
                    paragraphs
                )

            except Exception as e:

                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Could not read DOCX resume: "
                        + str(e)
                    )
                )

        else:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Only PDF, DOCX and TXT "
                    "files are supported."
                )
            )

        if not extracted_text.strip():

            raise HTTPException(
                status_code=400,
                detail=(
                    "Could not extract text "
                    "from the resume."
                )
            )

        return {

            "message":
                "Resume uploaded successfully",

            "filename":
                file.filename,

            "text":
                extracted_text
        }

    except HTTPException:
        raise

    except Exception as e:

        print(
            "UPLOAD RESUME ERROR:",
            repr(e)
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# =========================================================
# RESUME QUESTIONS
# IMPORTANT:
# NO GEMINI CALL HERE
# =========================================================

@app.post("/resume-questions")
def resume_questions(
    request: ResumeQuestionRequest
):

    try:

        resume_text = (
            request.resume_text.strip()
        )

        role = (
            request.role.strip()
            or "Software Developer"
        )

        count = max(
            1,
            min(request.count, 20)
        )

        if not resume_text:

            raise HTTPException(
                status_code=400,
                detail="Resume text is required."
            )

        text = resume_text.lower()

        questions = []

        # -------------------------------------------------
        # Detect skills
        # -------------------------------------------------

        if "python" in text:

            questions.append(
                "Explain your experience with Python and where you used it."
            )

        if (
            "machine learning" in text
            or "machine-learning" in text
            or re.search(r"\bml\b", text)
        ):

            questions.append(
                "Explain one Machine Learning concept mentioned in your resume."
            )

        if (
            "artificial intelligence" in text
            or re.search(r"\bai\b", text)
        ):

            questions.append(
                "What Artificial Intelligence techniques have you worked with?"
            )

        if (
            "sql" in text
            or "database" in text
            or "mysql" in text
            or "postgresql" in text
        ):

            questions.append(
                "Explain your experience with SQL and databases."
            )

        if "django" in text:

            questions.append(
                "How did you use Django in your project?"
            )

        if "react" in text:

            questions.append(
                "How did you use React in your project?"
            )

        if "javascript" in text:

            questions.append(
                "Explain how you used JavaScript in your projects."
            )

        if "html" in text:

            questions.append(
                "Explain the role of HTML in your project."
            )

        if "css" in text:

            questions.append(
                "How did you use CSS to design your project?"
            )

        if "aws" in text:

            questions.append(
                "What AWS services have you worked with?"
            )

        if "github" in text:

            questions.append(
                "How did you use Git and GitHub in your projects?"
            )

        if "project" in text:

            questions.append(
                "Explain your most important project and your contribution."
            )

        if "internship" in text:

            questions.append(
                "What did you learn during your internship?"
            )

        if "certification" in text:

            questions.append(
                "Which certification on your resume was most useful to you and why?"
            )

        # -------------------------------------------------
        # General questions
        # -------------------------------------------------

        questions.extend([

            f"Why are you interested in the {role} role?",

            "Explain one technical skill mentioned in your resume.",

            "What was the biggest challenge you faced in your project?",

            "How did you solve a difficult technical problem?",

            "Which project on your resume are you most confident discussing?",

            "What improvements would you make to one of your projects?",

            "How do your technical skills match this role?",

            "Describe a situation where you learned a new technology quickly.",

            "Explain your educational background and how it supports this role.",

            "What are your strongest technical skills?",

            "What was your exact contribution to your main project?",

            "What would you do differently if you rebuilt your project?",

            "How did you test your project?",

            "What technical problems did you face while developing your project?",

            "Why should we hire you for this role?"
        ])

        # -------------------------------------------------
        # Remove duplicates
        # -------------------------------------------------

        unique_questions = []

        for question in questions:

            if question not in unique_questions:

                unique_questions.append(question)

        # -------------------------------------------------
        # Difficulty
        # -------------------------------------------------

        if request.difficulty.lower() == "hard":

            unique_questions.extend([

                "How would you improve the scalability of your main project?",

                "What technical limitation exists in your project and how would you solve it?",

                "How would you redesign your project for production use?"
            ])

        elif request.difficulty.lower() == "medium":

            unique_questions.extend([

                "What technical improvement would you make to your project?",

                "How would you handle a major bug in your project?"
            ])

        # -------------------------------------------------
        # Limit
        # -------------------------------------------------

        unique_questions = unique_questions[:count]

        if not unique_questions:

            raise HTTPException(
                status_code=500,
                detail="No resume questions could be generated."
            )

        result = "\n".join(
            f"{index + 1}. {question}"
            for index, question
            in enumerate(unique_questions)
        )

        print(
            f"Generated {len(unique_questions)} "
            "resume questions locally."
        )

        return {
            "message":
                "Resume questions generated successfully",

            "questions":
                result
        }

    except HTTPException:
        raise

    except Exception as e:

        print(
            "RESUME QUESTIONS ERROR:",
            repr(e)
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )