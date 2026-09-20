import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

client = genai.Client(
    api_key=GEMINI_API_KEY
)


def generate_interview_questions(role, difficulty, count):

    prompt = f"""
You are an expert technical interviewer.

Generate {count} interview questions for:

Role: {role}
Difficulty: {difficulty}

Return only the questions as a numbered list.
Do not provide answers.
Do not provide explanations.
"""

    interaction = client.interactions.create(
        model="gemini-3.6-flash",
        input=prompt
    )

    return interaction.output_text


def evaluate_answer(question, answer):

    prompt = f"""
You are an expert technical interviewer.

Evaluate the candidate's answer.

Question:
{question}

Candidate's Answer:
{answer}

IMPORTANT:
Return exactly this format:

Score: 8/10
Feedback: Your feedback here.

The score must be a whole number from 0 to 10.
Do not use any other score format.
"""

    interaction = client.interactions.create(
        model="gemini-3.6-flash",
        input=prompt
    )

    return interaction.output_text


def generate_overall_feedback(role, average_score, answers):

    prompt = f"""
You are an expert technical interviewer.

Generate a final interview performance report.

Role:
{role}

Average Score:
{average_score}/10

Candidate answers and evaluations:
{answers}

Provide:

Overall Performance:
Strengths:
Weaknesses:
Areas to Improve:
Final Recommendation:

Keep the report professional, clear and concise.
"""

    interaction = client.interactions.create(
        model="gemini-3.6-flash",
        input=prompt
    )

    return interaction.output_text
def generate_resume_questions(
    resume_text,
    role,
    difficulty,
    count
):
    prompt = f"""
You are an expert technical interviewer.

Generate personalized interview questions
based on this candidate's resume.

Role: {role}
Difficulty: {difficulty}
Number of questions: {count}

Resume:
{resume_text}

Rules:
1. Questions must be based on the resume.
2. Focus on skills, projects, education and experience.
3. Do not invent information.
4. Return only numbered questions.
5. Do not provide answers.
6. Avoid duplicate questions.
"""

    interaction = client.interactions.create(
        model="gemini-3.6-flash",
        input=prompt
    )

    return interaction.output_text